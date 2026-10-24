import { Disposable } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { WorkerMessage } from "@lox-nexus/plugin-sdk/wire"
import type { SignalRegistry } from "../wires/SignalRegistry.ts"
import { Backoff } from "./Backoff.ts"
import { PluginCalls } from "./PluginCalls.ts"
import { InitFailedError, PluginSession, type SessionTimings } from "./PluginSession.ts"
import { PluginSignals, type PluginBus } from "./PluginSignals.ts"
import { PluginTopics } from "./PluginTopics.ts"
import type { PluginTransport } from "./PluginTransport.ts"
import type { PluginInstanceConfig, PluginLogSink, PluginPackage, PluginState, PluginStateStore } from "./PluginTypes.ts"

/** Session timeouts plus the restart policy, in ms. */
export interface SupervisorTimings extends SessionTimings {
  backoffInitialMs: number
  backoffMaxMs: number
  /** running this long without a crash resets the backoff */
  stableMs: number
}

export const DEFAULT_TIMINGS: SupervisorTimings = {
  helloMs: 10_000, initMs: 30_000, requestMs: 30_000, pingMs: 10_000, missedPings: 3, graceMs: 5_000,
  backoffInitialMs: 1_000, backoffMaxMs: 300_000, stableMs: 60_000
}

/** What a supervisor needs from the rest of Nexus. */
export interface SupervisorDeps {
  bus: PluginBus
  registry: Pick<SignalRegistry, "register" | "unregister" | "update">
  transport: PluginTransport
  store: PluginStateStore
  logs: PluginLogSink
  timings?: Partial<SupervisorTimings>
}

/**
 * Keeps one plugin instance running. States: stopped → starting → running ⇄ degraded; `error`
 * when the plugin refuses to start (invalid config, start() threw), with no restart; `crashed`
 * when it dies (exit, out of memory, missed pings), restarted with a doubling backoff; stopping.
 * start(), stop() and update() run one after another, so overlapping clicks can't leak a worker.
 */
export class PluginSupervisor extends Disposable {
  readonly signals: PluginSignals
  readonly calls: PluginCalls
  private session: PluginSession | undefined
  private current: PluginState = "stopped"
  private failure: string | undefined
  private readonly timings: SupervisorTimings
  private readonly backoff: Backoff
  private topics: PluginTopics
  private lifecycle: Promise<unknown> = Promise.resolve()
  private cancelRestart = () => {}
  private cancelStable = () => {}

  constructor(private instance: PluginInstanceConfig, private pkg: PluginPackage, private readonly deps: SupervisorDeps) {
    super()
    this.timings = { ...DEFAULT_TIMINGS, ...deps.timings }
    this.backoff = new Backoff(this.timings.backoffInitialMs, this.timings.backoffMaxMs)
    this.topics = new PluginTopics(instance)
    this.calls = new PluginCalls(() => this.session, () => this.signals, deps.bus)
    this.signals = this.own(new PluginSignals(instance, pkg, deps.bus, deps.registry, (id, value, cause) => this.calls.actuate(id, value, cause)))
    this.onDispose(() => this.serialize(() => this.close("stopped")))
    this.publishState()
  }

  get config() {
    return this.instance
  }

  get state() {
    return this.current
  }

  /** why it last failed to start or crashed; cleared by a successful start */
  get lastError() {
    return this.failure
  }

  /** starts the plugin; failing to start is not an error of the call, see `state` and `lastError` */
  start(): Promise<void> {
    return this.serialize(() => this.open())
  }

  stop(): Promise<void> {
    return this.serialize(() => this.close("stopped"))
  }

  /**
   * Applies a new config or package version (same id). A running plugin restarts with it; a new
   * slug moves every topic, and wires survive because they refer to signal ids.
   */
  update(instance: PluginInstanceConfig, pkg: PluginPackage = this.pkg): Promise<void> {
    return this.serialize(async () => {
      const wasRunning = this.session !== undefined
      await this.close("stopped")
      if (instance.slug !== this.instance.slug) this.rename(instance)
      this.instance = instance
      this.pkg = pkg
      if (wasRunning && !this.isDisposed) await this.open()
    })
  }

  private async open() {
    if (this.session || this.isDisposed) return
    this.cancelRestart()
    this.setState("starting")
    const session = new PluginSession(this.deps.transport.open(this.pkg.entry), this.timings)
    this.wire(session)
    try {
      await session.open({ instanceId: this.instance.id, config: this.instance.config, store: this.deps.store.load(this.instance.id) })
    } catch (error) {
      await session.dispose().catch(() => undefined)
      return error instanceof InitFailedError ? this.refused(error.message) : this.crashed(PluginSupervisor.message(error))
    }
    this.session = session
    this.failure = undefined
    await this.calls.addAll()
    this.setState("running")
    this.cancelStable = this.after(this.timings.stableMs, () => this.backoff.reset())
  }

  private async close(state: PluginState) {
    this.cancelRestart()
    this.cancelStable()
    const session = this.session
    this.session = undefined
    if (session) {
      this.setState("stopping")
      await session.close().catch(() => undefined)
    }
    this.setState(state)
  }

  private wire(session: PluginSession) {
    session.events.on("message", message => this.receive(message))
    session.events.on("output", (stream, line) => this.deps.logs.log(this.instance, stream === "stderr" ? "warn" : "info", line))
    session.events.on("ended", reason => {
      if (this.session !== session) return
      this.session = undefined
      this.cancelStable()
      this.crashed(reason)
    })
  }

  private receive(message: WorkerMessage) {
    switch (message.type) {
      case "emit": return this.signals.publish(message.signalId, message.value, message.causeId)
      case "log": return this.deps.logs.log(this.instance, message.level, message.message, message.data)
      case "store.set": return this.deps.store.set(this.instance.id, message.key, message.value)
      case "store.delete": return this.deps.store.delete(this.instance.id, message.key)
      case "signal.error":
        this.signals.setError(message.signalId, message.error)
        return this.report(`signal "${message.signalId}" failed: ${message.error}`)
      case "status":
        if (this.session) this.setState(message.status)
        if (message.status === "degraded") this.report(message.message ?? "degraded")
    }
  }

  private refused(reason: string) {
    this.failure = reason
    this.setState("error")
    this.report(`failed to start: ${reason}`)
  }

  private crashed(reason: string) {
    if (this.isDisposed) return
    this.failure = reason
    this.setState("crashed")
    const delay = this.backoff.next()
    this.report(`${reason}; restarting in ${Math.round(delay / 1000)} s`)
    this.cancelRestart = this.after(delay, () => void this.start())
  }

  private rename(instance: PluginInstanceConfig) {
    this.signals.rename(instance)
    this.topics = new PluginTopics(instance)
    this.publishState()
  }

  private setState(state: PluginState) {
    this.current = state
    this.publishState()
  }

  private publishState() {
    this.deps.bus.publish(this.topics.status, Value.string(this.current), { source: this.signals.source })
  }

  private report(text: string) {
    this.deps.bus.event(this.topics.errors, text, { source: this.signals.source })
  }

  // a failure rejects only its own caller; the chain goes on
  private serialize(work: () => Promise<void>): Promise<void> {
    const next = this.lifecycle.then(work)
    this.lifecycle = next.catch(() => undefined)
    return next
  }

  private static message(error: unknown) {
    return error instanceof Error ? error.message.replace(/^the plugin /, "") : String(error)
  }
}
