import { Disposable } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { SignalRegistry } from "../wires/SignalRegistry.ts"
import { Backoff } from "./Backoff.ts"
import { PluginCalls } from "./PluginCalls.ts"
import { PluginInbox } from "./PluginInbox.ts"
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
  private readonly inbox: PluginInbox
  private session: PluginSession | undefined
  private current: PluginState = "stopped"
  private failure: string | undefined
  private crashes = 0
  private readonly timings: SupervisorTimings
  private readonly backoff: Backoff
  private topics: PluginTopics
  private lifecycle: Promise<unknown> = Promise.resolve()
  private cancelRestart = () => {}
  private cancelStable = () => {}

  constructor(private instance: PluginInstanceConfig, private currentPkg: PluginPackage, private readonly deps: SupervisorDeps) {
    super()
    this.timings = { ...DEFAULT_TIMINGS, ...deps.timings }
    this.backoff = new Backoff(this.timings.backoffInitialMs, this.timings.backoffMaxMs)
    this.topics = new PluginTopics(instance)
    this.calls = new PluginCalls(() => this.session, () => this.signals, deps.bus)
    this.signals = this.own(new PluginSignals(instance, () => this.currentPkg, deps.bus, deps.registry, (id, value, cause) => this.calls.actuate(id, value, cause)))
    this.inbox = new PluginInbox({
      instance: () => this.instance, signals: this.signals, store: deps.store, logs: deps.logs, report: text => this.report(text),
      healthChanged: health => this.session && this.setState(health)
    })
    this.onDispose(() => this.serialize(() => this.close("stopped")))
    this.publishState()
  }

  /** the instance config in force; replaced by update() */
  get config() {
    return this.instance
  }

  /** the package it runs; replaced by update() */
  get pkg() {
    return this.currentPkg
  }

  /** mirrored on the instance's status topic at every change */
  get state() {
    return this.current
  }

  /** why it last failed to start or crashed; cleared by a successful start */
  get lastError() {
    return this.failure
  }

  /** what the plugin reported with "degraded"; undefined while it is fine or not running */
  get statusMessage() {
    return this.session ? this.inbox.message : undefined
  }

  /** automatic restarts after crashes since the last start() or stop() from outside */
  get restarts() {
    return this.crashes
  }

  /** starts the plugin; failing to start is not an error of the call, see `state` and `lastError` */
  start(): Promise<void> {
    this.crashes = 0
    return this.serialize(() => this.open())
  }

  /** stops the plugin gracefully and cancels a pending restart; a stopped instance stays stopped */
  stop(): Promise<void> {
    this.crashes = 0
    return this.serialize(() => this.close("stopped"))
  }

  /**
   * Applies a new config or package version (same id); what is left out stays, resolved when its
   * turn in the lifecycle queue comes, so a queued reload never re-applies an older config. A
   * running plugin restarts with it; a new slug moves every topic, and wires survive because they
   * refer to signal ids. An instance that was not running (stopped, error, or waiting for a
   * restart) stays stopped.
   */
  update(instance?: PluginInstanceConfig, pkg?: PluginPackage): Promise<void> {
    return this.serialize(async () => {
      const next = instance ?? this.instance
      const wasRunning = this.session !== undefined
      await this.close("stopped")
      if (next.slug !== this.instance.slug) this.rename(next)
      this.instance = next
      if (pkg) {
        this.currentPkg = pkg
        this.signals.refresh()
      }
      if (wasRunning && !this.isDisposed) await this.open()
    })
  }

  // never rejects: every failure becomes a state; a dispose meanwhile closes what was opened
  private async open() {
    if (this.session || this.isDisposed) return
    this.cancelRestart()
    this.inbox.reset()
    this.setState("starting")
    let session: PluginSession | undefined
    try {
      session = new PluginSession(this.deps.transport.open(this.currentPkg.entry), this.timings)
      this.wire(session)
      await session.open({ instanceId: this.instance.id, config: this.instance.config, store: this.deps.store.load(this.instance.id) })
    } catch (error) {
      await session?.dispose().catch(() => undefined)
      return error instanceof InitFailedError ? this.refused(error.message) : this.crashed(PluginSupervisor.message(error))
    }
    if (this.isDisposed) return void await session.close().catch(() => undefined)
    this.session = session
    this.failure = undefined
    await this.calls.addAll()
    if (this.isDisposed || this.session !== session) return
    this.setState(this.inbox.health)
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
    session.events.on("message", message => this.inbox.receive(message))
    session.events.on("output", (stream, line) => this.deps.logs.log(this.instance, stream === "stderr" ? "warn" : "info", line))
    session.events.on("ended", reason => {
      if (this.session !== session) return
      this.session = undefined
      this.cancelStable()
      this.crashed(reason)
    })
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
    this.cancelRestart = this.after(delay, () => void this.restart().catch((error: unknown) => this.report(`restarting failed: ${PluginSupervisor.message(error)}`)))
  }

  // an automatic start after a crash, counted in `restarts`
  private restart() {
    this.crashes++
    return this.serialize(() => this.open())
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
