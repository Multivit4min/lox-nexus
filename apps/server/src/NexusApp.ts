import {
  EventBus, PluginManager, Recorder, SignalRegistry, SystemClock, WireEngine, WorkerTransport,
  type Clock, type PluginTransport, type SupervisorTimings
} from "@lox-nexus/core"
import { MiniserverFtp, MiniserverManager, ProjectReader } from "@lox-nexus/loxone"
import { Disposable } from "@lox-nexus/plugin-sdk"
import type { Logger } from "pino"
import { AuthService } from "./auth/AuthService.ts"
import { LoginThrottle } from "./auth/LoginThrottle.ts"
import { PasswordHasher } from "./auth/PasswordHasher.ts"
import { SessionService } from "./auth/SessionService.ts"
import type { Config } from "./config/Config.ts"
import { Persistence } from "./db/Persistence.ts"
import { AuthGuard } from "./http/AuthGuard.ts"
import { AuthController } from "./http/controllers/AuthController.ts"
import { BusController } from "./http/controllers/BusController.ts"
import { ConfigController } from "./http/controllers/ConfigController.ts"
import { HookController } from "./http/controllers/HookController.ts"
import { MiniserverController } from "./http/controllers/MiniserverController.ts"
import { PluginController } from "./http/controllers/PluginController.ts"
import { PluginPackageController } from "./http/controllers/PluginPackageController.ts"
import { SignalController } from "./http/controllers/SignalController.ts"
import { HttpServer } from "./http/HttpServer.ts"
import { SessionCookie } from "./http/SessionCookie.ts"
import { PluginAssembly, type InstallOptions } from "./plugins/PluginAssembly.ts"
import type { PluginCatalog } from "./plugins/PluginCatalog.ts"
import { ConfigTransfer } from "./services/ConfigTransfer.ts"
import { LoxoneProjectService } from "./services/LoxoneProjectService.ts"
import { LoxoneSignalService } from "./services/LoxoneSignalService.ts"
import { MiniserverService } from "./services/MiniserverService.ts"
import { PluginLogs } from "./services/PluginLogs.ts"
import { PluginService } from "./services/PluginService.ts"
import { PluginSignalService } from "./services/PluginSignalService.ts"
import { SnapshotWriter } from "./services/SnapshotWriter.ts"
import { SystemEventLogger } from "./services/SystemEventLogger.ts"
import { TopicCleanup } from "./services/TopicCleanup.ts"
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
}

/** The services the HTTP layer needs, built in start(). */
interface Services {
  miniservers: MiniserverService
  loxoneSignals: LoxoneSignalService
  wires: WireService
  plugins: PluginService
  pluginSignals: PluginSignalService
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
  private http: HttpServer | undefined
  private stream: BusStream | undefined

  /** @throws when the database can't be opened or migrated */
  constructor(private readonly config: Config, private readonly log: Logger, private readonly options: NexusAppOptions = {}) {
    super()
    this.clock = options.clock ?? new SystemClock()
    this.persistence = new Persistence(options.databaseFile ?? config.databaseFile, message => log.warn(message))
    this.onDispose(() => this.persistence.close())
    this.bus = this.own(new EventBus({ clock: this.clock, forces: this.persistence.forces, topicKinds: this.signals }))
    this.recorder = this.own(new Recorder(this.bus))
    this.wires = this.own(new WireEngine(this.bus, this.signals))
    // owned before the Miniservers, so it is disposed after them and saves their last values
    this.snapshot = this.own(new SnapshotWriter(this.bus, this.signals, this.persistence.snapshot, log))
    this.miniservers = this.own(new MiniserverManager({ bus: this.bus, signals: this.signals, clock: this.clock, loadHistory: this.persistence.loadSamples }))
    const transport = options.pluginTransport ?? new WorkerTransport()
    this.pluginLogs = new PluginLogs(log.child({ component: "plugin" }), this.clock)
    this.plugins = this.own(new PluginManager({
      bus: this.bus, registry: this.signals, transport, store: this.persistence.pluginStore,
      logs: this.pluginLogs, ...(options.pluginTimings ? { timings: options.pluginTimings } : {})
    }))
    this.pluginAssembly = this.own(new PluginAssembly(config, transport, this.persistence.pluginPackages, log, options.install))
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
    const loxoneSignals = new LoxoneSignalService(db.loxoneSignals, this.miniservers, cleanup, log)
    const miniservers = new MiniserverService(db.miniservers, this.miniservers, loxoneSignals, cleanup, log)
    const wires = new WireService(db.wires, this.wires, this.signals, log)
    const plugins = new PluginService(db.pluginInstances, db.pluginSignals, this.plugins, this.pluginCatalog, cleanup, log, this.pluginLogs)
    const pluginSignals = new PluginSignalService(db.pluginSignals, plugins, cleanup)
    this.bus.restoreForces()
    miniservers.load()
    await this.pluginAssembly.load(plugins)
    if (this.isDisposed) return undefined
    plugins.load()
    wires.load()
    this.snapshot.restore()
    for (const failure of await this.miniservers.startEnabled()) log.warn({ err: failure.error, miniserver: failure.id }, "miniserver failed to start")
    if (this.isDisposed) return undefined
    this.own(new SystemEventLogger(this.bus, log.child({ component: "bus" })))
    this.http = this.own(this.createHttp({ miniservers, loxoneSignals, wires, plugins, pluginSignals }))
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
  private createHttp({ miniservers, loxoneSignals, wires, plugins, pluginSignals }: Services) {
    const { persistence: db, clock, config, log } = this
    const sessions = new SessionService(db.sessions, clock)
    this.every(60 * 60 * 1000, () => this.pruneSessions(sessions))
    const auth = new AuthService(db.db, db.users, sessions, new PasswordHasher(this.options.hasherCost), clock)
    const cookie = new SessionCookie(config.secureCookies)
    const stream = this.own(new BusStream(this.bus, auth, sessions, cookie))
    this.stream = stream
    return new HttpServer({
      logger: log,
      guard: new AuthGuard(auth, cookie, config.publicOrigins),
      webDir: config.webDir,
      docsDir: config.docsDir,
      trustProxy: config.trustProxy,
      controllers: [
        new AuthController(auth, new LoginThrottle(clock), cookie),
        new MiniserverController(miniservers, loxoneSignals, new LoxoneProjectService(miniservers, this.options.projectReader ?? new ProjectReader(new MiniserverFtp()))),
        new SignalController(this.signals, this.bus, wires),
        new BusController(this.bus, this.recorder),
        new ConfigController(new ConfigTransfer({ miniservers, signals: loxoneSignals, wires }, log)),
        new PluginController(plugins, pluginSignals, this.pluginLogs),
        new PluginPackageController(this.pluginAssembly.packages(plugins)),
        stream
      ],
      publicControllers: [new HookController(this.plugins)]
    })
  }

  // a timer callback must not throw: a busy database here would otherwise crash the process
  private pruneSessions(sessions: SessionService) {
    try {
      sessions.prune()
    } catch (error) {
      this.log.warn({ err: error }, "removing expired sessions failed")
    }
  }
}
