import { randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import {
  CausalChain, EventBus, PluginManager, Recorder, SignalRegistry, SystemClock, WireEngine, WorkerTransport,
  type Clock, type PluginTransport, type SupervisorTimings
} from "@lox-nexus/core"
import { MiniserverFtp, MiniserverManager, ProjectReader } from "@lox-nexus/loxone"
import { Disposable } from "@lox-nexus/plugin-sdk"
import type { Logger } from "pino"
import { AuthService } from "./auth/AuthService.ts"
import { LoginThrottle } from "./auth/LoginThrottle.ts"
import { PasswordHasher } from "./auth/PasswordHasher.ts"
import { SessionPruner } from "./auth/SessionPruner.ts"
import { SessionService } from "./auth/SessionService.ts"
import type { Config } from "./config/Config.ts"
import { DatabaseLock } from "./db/DatabaseLock.ts"
import { Persistence } from "./db/Persistence.ts"
import { AuthGuard } from "./http/AuthGuard.ts"
import { PluginControllers } from "./http/PluginControllers.ts"
import { AuthController } from "./http/controllers/AuthController.ts"
import { BusController } from "./http/controllers/BusController.ts"
import { ConfigController } from "./http/controllers/ConfigController.ts"
import { HookController } from "./http/controllers/HookController.ts"
import { MiniserverController } from "./http/controllers/MiniserverController.ts"
import { SignalController } from "./http/controllers/SignalController.ts"
import { ChangeLock } from "./http/ChangeLock.ts"
import { HttpServer } from "./http/HttpServer.ts"
import { SessionCookie } from "./http/SessionCookie.ts"
import { PluginAssembly, type InstallOptions } from "./plugins/PluginAssembly.ts"
import type { PluginCatalog } from "./plugins/PluginCatalog.ts"
import { DiagnosticsAssembly } from "./diagnostics/DiagnosticsAssembly.ts"
import { ConfigTransfer } from "./services/ConfigTransfer.ts"
import { ImportJournal } from "./services/ImportJournal.ts"
import { LoxoneProjectService } from "./services/LoxoneProjectService.ts"
import { TimeZoneSetting } from "./services/TimeZoneSetting.ts"
import { LoxoneSignalService } from "./services/LoxoneSignalService.ts"
import { MiniserverService } from "./services/MiniserverService.ts"
import { PluginLogs } from "./services/PluginLogs.ts"
import { StaleWatcher } from "./services/StaleWatcher.ts"
import { BackupAssembly } from "./backup/BackupAssembly.ts"
import { BackupService } from "./backup/BackupService.ts"
import { RestoreApplier } from "./backup/RestoreApplier.ts"
import { HistoryAssembly } from "./history/HistoryAssembly.ts"
import { PluginService } from "./services/PluginService.ts"
import { SelectionService } from "./services/SelectionService.ts"
import { PluginSignalService } from "./services/PluginSignalService.ts"
import { SnapshotWriter } from "./services/SnapshotWriter.ts"
import { SystemEventLogger } from "./services/SystemEventLogger.ts"
import { TopicCleanup } from "./services/TopicCleanup.ts"
import { UnloadableRows } from "./services/UnloadableRows.ts"
import { WireService } from "./services/WireService.ts"
import { BusStream } from "./stream/BusStream.ts"

/** Overrides for tests; production uses the defaults. */
export interface NexusAppOptions {
  /** default: <dataDir>/nexus.db */
  databaseFile?: string
  clock?: Clock
  /** scrypt cost; tests use a small one */
  hasherCost?: number
  /** how plugins run; tests pass a fake that runs them in-process */
  pluginTransport?: PluginTransport
  pluginTimings?: Partial<SupervisorTimings>
  /** reads Loxone Config projects from Miniservers; tests pass a fake instead of FTP */
  projectReader?: Pick<ProjectReader, "read" | "file">
  install?: InstallOptions
  /** restarts the app in-process (main.ts), e.g. to apply a restored backup; tests leave it out */
  restart?: () => void
}

/** The services the HTTP layer needs, built in start(). */
interface Services {
  miniservers: MiniserverService
  loxoneSignals: LoxoneSignalService
  wires: WireService
  plugins: PluginService
  pluginSignals: PluginSignalService
  transfer: ConfigTransfer
  lock: ChangeLock
}

/**
 * Composition root: the only place where services are constructed and wired. Boot order matters:
 * forces before anything publishes (restored values then arrive shadowed), signals (Loxone and
 * plugin) before wires, wires before the snapshot (so syncOnStart wires see restored values), the
 * snapshot before the Miniservers start (so their outputs get the restored values), HTTP, and
 * plugins last, in the background, so a slow plugin never delays the server.
 * Disposal runs in reverse: HTTP closes first, the database last.
 */
export class NexusApp extends Disposable {
  /** the opened, migrated database; closed last on dispose */
  readonly persistence: Persistence
  readonly signals = new SignalRegistry()
  readonly bus: EventBus
  readonly recorder: Recorder
  readonly wires: WireEngine
  readonly miniservers: MiniserverManager
  readonly plugins: PluginManager
  /** the plugins instances can be created from; filled at start */
  readonly pluginCatalog: PluginCatalog
  private readonly pluginAssembly: PluginAssembly
  /** each plugin instance's recent log lines */
  readonly pluginLogs: PluginLogs
  private readonly clock: Clock
  private readonly snapshot: SnapshotWriter
  /** which signals the history and watching plugins take */
  readonly selections: SelectionService
  readonly history: HistoryAssembly
  private http: HttpServer | undefined
  /** next to the database; none for an in-memory one */
  private readonly journal: ImportJournal | undefined
  private stream: BusStream | undefined

  /** @throws when the database can't be opened or migrated */
  constructor(private readonly config: Config, private readonly log: Logger, private readonly options: NexusAppOptions = {}) {
    super()
    this.clock = options.clock ?? new SystemClock()
    const databaseFile = options.databaseFile ?? config.databaseFile
    if (databaseFile !== ":memory:") {
      fs.mkdirSync(path.dirname(databaseFile), { recursive: true, mode: 0o700 })
      this.journal = ImportJournal.in(path.dirname(databaseFile))
      const lock = DatabaseLock.acquire(databaseFile)
      // registered first, so it is released last, after the database is closed
      this.onDispose(() => lock.release())
      // under the lock, before anything opens the files: a second process must not swap them under a running one
      BackupService.sweep(config.dataDir)
      const before = RestoreApplier.apply(config.dataDir)
      if (before) log.warn({ before }, "restored a backup; the previous files are in this folder")
    }
    this.persistence = new Persistence(databaseFile, message => log.warn(message))
    this.onDispose(() => this.persistence.close())
    this.bus = this.own(new EventBus({ clock: this.clock, chain: new CausalChain(randomUUID().slice(0, 8)), forces: this.persistence.forces, topicKinds: this.signals }))
    this.recorder = this.own(new Recorder(this.bus))
    this.wires = this.own(new WireEngine(this.bus, this.signals))
    // owned before the Miniservers, so it is disposed after them and saves their last values
    this.snapshot = this.own(new SnapshotWriter(this.bus, this.signals, this.persistence.snapshot, log))
    this.selections = new SelectionService(this.persistence.selections)
    // owned before the Miniservers and plugins too: their first values are recorded, and the last ones written on shutdown
    const historyFile = databaseFile === ":memory:" ? ":memory:" : path.join(path.dirname(databaseFile), "history.db")
    this.history = this.own(new HistoryAssembly(historyFile, {
      bus: this.bus, signals: this.signals, settings: this.persistence.settings, signalExists: id => this.persistence.signalIndex.exists(id),
      selections: this.selections, clock: this.clock, log
    }))
    // rules go with their signal in the database; the cached selections must follow
    this.listen(this.signals, "unregistered", () => this.selections.invalidate())
    this.miniservers = this.own(new MiniserverManager({ bus: this.bus, signals: this.signals, clock: this.clock, loadHistory: this.persistence.loadSamples }))
    const transport = options.pluginTransport ?? new WorkerTransport()
    this.pluginLogs = this.own(new PluginLogs(log.child({ component: "plugin" }), this.clock))
    // the Loxone project's, kept by LoxoneProjectService; stateless, so each user makes its own
    const timeZone = new TimeZoneSetting(this.persistence.settings)
    this.plugins = this.own(new PluginManager({
      bus: this.bus, registry: this.signals, transport, store: this.persistence.pluginStore, timeZone: () => timeZone.get(),
      watch: { bus: this.bus, signals: this.signals, selection: id => this.selections.of(id), changes: this.selections },
      logs: this.pluginLogs, configMigrated: ({ id, config, configVersion }) => this.persistence.pluginInstances.saveConfig(id, config, configVersion ?? 1), ...(options.pluginTimings ? { timings: options.pluginTimings } : {})
    }))
    this.pluginAssembly = this.own(new PluginAssembly(config, transport, this.persistence.pluginPackages, this.persistence.pluginSignals, log, options.install))
    this.pluginCatalog = this.pluginAssembly.catalog
  }

  /**
   * Restores state, starts the Miniservers and listens for HTTP. Stops early (without error) when
   * the app is disposed meanwhile, e.g. by SIGTERM during startup.
   * @returns the HTTP address, or undefined when stopped early
   */
  async start(): Promise<string | undefined> {
    const { persistence: db, log } = this
    if (db.applied.length > 0) log.info({ migrations: db.applied }, "database migrated")
    const cleanup = new TopicCleanup(this.bus, db.snapshot)
    const unloadable = new UnloadableRows()
    const loxoneSignals = new LoxoneSignalService(db.loxoneSignals, this.miniservers, cleanup, unloadable, log)
    const wires = new WireService(db.wires, this.wires, this.signals, log)
    const miniservers = new MiniserverService(db.miniservers, this.miniservers, loxoneSignals, cleanup, unloadable, log, wires)
    const plugins = new PluginService(db.pluginInstances, db.pluginSignals, this.plugins, this.pluginCatalog, cleanup, log, this.pluginLogs, wires, this.selections,
      this.pluginAssembly.settingsCheck(id => db.pluginInstances.get(id), this.persistence.pluginStore))
    const pluginSignals = new PluginSignalService(db.pluginSignals, plugins, cleanup)
    const lock = new ChangeLock()
    const runtime = { cleanup, exists: (topic: string) => this.signals.atTopic(topic) !== undefined }
    const transfer = new ConfigTransfer({ miniservers, signals: loxoneSignals, wires, selections: this.selections }, log, { lock, journal: this.journal, runtime })
    this.bus.restoreForces()
    miniservers.load()
    await this.pluginAssembly.load(plugins)
    if (this.isDisposed) return undefined
    plugins.load()
    wires.load()
    // before values come back and Miniservers start, so a half import never talks to a Miniserver
    await transfer.recover()
    this.snapshot.restore()
    for (const failure of await this.miniservers.startEnabled()) log.warn({ err: failure.error, miniserver: failure.id }, "miniserver failed to start")
    if (this.isDisposed) return undefined
    this.own(new SystemEventLogger(this.bus, log.child({ component: "bus" })))
    this.http = this.own(this.createHttp({ miniservers, loxoneSignals, wires, plugins, pluginSignals, transfer, lock }))
    const address = await this.http.start(this.config.httpPort, this.config.httpHost)
    // failures show up as each instance's state; nothing to wait for here
    this.plugins.startEnabled().catch((error: unknown) => log.error({ err: error }, "starting the plugins failed"))
    return address
  }

  /** the HTTP server; undefined until start() got that far. Tests use its inject(). */
  get server() {
    return this.http
  }

  /** the live stream; undefined until start() got that far. Tests check its open connections. */
  get streams() {
    return this.stream
  }

  /** Builds the auth stack and HTTP server. Called once from start(); everything created here is owned by the app. */
  private createHttp({ miniservers, loxoneSignals, wires, plugins, pluginSignals, transfer, lock }: Services) {
    const { persistence: db, clock, config, log } = this
    const sessions = new SessionService(db.sessions, clock)
    this.own(new SessionPruner(sessions, log))
    const auth = new AuthService(db.db, db.users, sessions, new PasswordHasher(this.options.hasherCost), clock)
    const cookie = new SessionCookie(config.secureCookies)
    const stale = this.own(new StaleWatcher({ signals: this.signals, bus: this.bus, clock, active: StaleWatcher.activeIn(this.miniservers, this.plugins) }))
    const stream = this.own(new BusStream(this.bus, auth, sessions, cookie, stale))
    this.stream = stream
    return new HttpServer({
      logger: log,
      guard: new AuthGuard(auth, cookie, config.publicOrigins),
      lock,
      webDir: config.webDir,
      docsDir: config.docsDir,
      trustProxy: config.trustProxy,
      controllers: [
        new AuthController(auth, new LoginThrottle(clock), cookie),
        new MiniserverController(miniservers, loxoneSignals, new LoxoneProjectService(miniservers, this.options.projectReader ?? new ProjectReader(new MiniserverFtp()), new TimeZoneSetting(db.settings))),
        new SignalController(this.signals, this.bus, wires),
        new BusController(this.bus, this.recorder),
        new ConfigController(transfer),
        ...PluginControllers.build({ plugins, pluginSignals, loxoneSignals, wires, logs: this.pluginLogs, assembly: this.pluginAssembly, log }),
        ...this.history.controllers(id => plugins.watches(id)),
        BackupAssembly.controller(config, { main: db.db, history: this.history.database.db }, this.options.restart, log),
        this.own(new DiagnosticsAssembly(this, config, clock, log)).controller(),
        stream
      ],
      publicControllers: [new HookController(this.plugins)]
    })
  }
}
