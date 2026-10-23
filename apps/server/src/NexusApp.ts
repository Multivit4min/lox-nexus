import { EventBus, Recorder, SignalRegistry, SystemClock, WireEngine, type Clock } from "@lox-nexus/core"
import { MiniserverManager } from "@lox-nexus/loxone"
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
import { MiniserverController } from "./http/controllers/MiniserverController.ts"
import { SignalController } from "./http/controllers/SignalController.ts"
import { HttpServer } from "./http/HttpServer.ts"
import { SessionCookie } from "./http/SessionCookie.ts"
import { LoxoneSignalService } from "./services/LoxoneSignalService.ts"
import { MiniserverService } from "./services/MiniserverService.ts"
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
}

/**
 * Composition root: the only place where services are constructed and wired. Boot order matters:
 * forces before anything publishes (restored values then arrive shadowed), signals before wires,
 * wires before the snapshot (so syncOnStart wires see restored values), the snapshot before the
 * Miniservers start (so their outputs get the restored values), HTTP last.
 * Disposal runs in reverse: HTTP closes first, the database last.
 */
export class NexusApp extends Disposable {
  readonly persistence: Persistence
  readonly signals = new SignalRegistry()
  readonly bus: EventBus
  readonly recorder: Recorder
  readonly wires: WireEngine
  readonly miniservers: MiniserverManager
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
    this.miniservers = this.own(new MiniserverManager({ bus: this.bus, signals: this.signals, clock: this.clock }))
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
    const wires = new WireService(db.wires, this.wires, log)
    this.bus.restoreForces()
    miniservers.load()
    wires.load()
    this.snapshot.restore()
    for (const failure of await this.miniservers.startEnabled()) log.warn({ err: failure.error, miniserver: failure.id }, "miniserver failed to start")
    if (this.isDisposed) return undefined
    this.own(new SystemEventLogger(this.bus, log.child({ component: "bus" })))
    this.http = this.own(this.createHttp(miniservers, loxoneSignals, wires))
    return this.http.start(this.config.httpPort, this.config.httpHost)
  }

  /** the HTTP server once started; tests use its inject() */
  get server() {
    return this.http
  }

  /** the live stream once started; tests check its open connections */
  get streams() {
    return this.stream
  }

  private createHttp(miniservers: MiniserverService, loxoneSignals: LoxoneSignalService, wires: WireService) {
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
      trustProxy: config.trustProxy,
      controllers: [
        new AuthController(auth, new LoginThrottle(clock), cookie),
        new MiniserverController(miniservers, loxoneSignals),
        new SignalController(this.signals, this.bus, wires),
        new BusController(this.bus, this.recorder),
        stream
      ]
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
