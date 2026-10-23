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
  private http: HttpServer | undefined

  constructor(private readonly config: Config, private readonly log: Logger, private readonly options: NexusAppOptions = {}) {
    super()
    this.clock = options.clock ?? new SystemClock()
    this.persistence = new Persistence(options.databaseFile ?? config.databaseFile, message => log.warn(message))
    this.onDispose(() => this.persistence.close())
    this.bus = this.own(new EventBus({ clock: this.clock, forces: this.persistence.forces, topicKinds: this.signals }))
    this.recorder = this.own(new Recorder(this.bus))
    this.wires = this.own(new WireEngine(this.bus, this.signals))
    this.miniservers = this.own(new MiniserverManager({ bus: this.bus, signals: this.signals, clock: this.clock }))
  }

  /** restores state, starts the Miniservers and listens for HTTP. @returns the HTTP address */
  async start(): Promise<string> {
    const { persistence: db, log } = this
    if (db.applied.length > 0) log.info({ migrations: db.applied }, "database migrated")
    const loxoneSignals = new LoxoneSignalService(db.loxoneSignals, this.miniservers, log)
    const miniservers = new MiniserverService(db.miniservers, this.miniservers, loxoneSignals, log)
    const wires = new WireService(db.wires, this.wires, log)
    this.bus.restoreForces()
    miniservers.load()
    wires.load()
    this.bus.restoreSnapshot(db.snapshot.load())
    for (const failure of await this.miniservers.startEnabled()) log.warn({ err: failure.error, miniserver: failure.id }, "miniserver failed to start")
    this.own(new SnapshotWriter(this.bus, this.signals, db.snapshot, log))
    this.own(new SystemEventLogger(this.bus, log.child({ component: "bus" })))
    this.http = this.own(this.createHttp(miniservers, loxoneSignals, wires))
    return this.http.start(this.config.httpPort, this.config.httpHost)
  }

  /** the HTTP server once started; tests use its inject() */
  get server() {
    return this.http
  }

  private createHttp(miniservers: MiniserverService, loxoneSignals: LoxoneSignalService, wires: WireService) {
    const { persistence: db, clock } = this
    const sessions = new SessionService(db.sessions, clock)
    this.every(60 * 60 * 1000, () => void sessions.prune())
    const auth = new AuthService(db.db, db.users, sessions, new PasswordHasher(this.options.hasherCost), clock)
    const cookie = new SessionCookie(this.config.secureCookies)
    const stream = this.own(new BusStream(this.bus))
    return new HttpServer({
      logger: this.log,
      guard: new AuthGuard(auth, cookie),
      webDir: this.config.webDir,
      controllers: [
        new AuthController(auth, new LoginThrottle(clock), cookie),
        new MiniserverController(miniservers, loxoneSignals),
        new SignalController(this.signals, this.bus, wires),
        new BusController(this.bus, this.recorder),
        stream
      ]
    })
  }
}
