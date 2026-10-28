import { Disposable, type Listenable } from "@lox-nexus/plugin-sdk"
import type { HostMessage, WatchedSignal, WatchedValue } from "@lox-nexus/plugin-sdk/wire"
import type { BusMessage } from "../bus/BusMessage.ts"
import type { EventBus } from "../bus/EventBus.ts"
import { SelectedValues } from "../selection/SelectedValues.ts"
import type { SignalSelection } from "../selection/SignalSelection.ts"
import type { Signal } from "../wires/Signal.ts"
import type { SignalRegistry } from "../wires/SignalRegistry.ts"

/** What feeding a watching plugin needs from Nexus. */
export interface WatchDeps {
  bus: Pick<EventBus, "subscribe" | "current">
  signals: Pick<SignalRegistry, "atTopic" | "list" | "on" | "off">
  /** the signals the user chose for this instance; a new object whenever the choice changes */
  selection: (instanceId: string) => SignalSelection
  /** emits `changed` with a consumer id when its choice changed, so the feed follows at once instead of within a tick */
  changes?: Listenable
}

type Send = (message: Extract<HostMessage, { type: "watch.signals" | "watch.values" }>) => void

/**
 * Feeds a watching plugin (one that declares `watches`) the values of the signals the user chose
 * for it: first the list of signals and their current values, then every state and command as
 * subscribers see it. A value goes out at once while fewer than IN_FLIGHT batches wait for the
 * plugin's ack; otherwise values gather into batches of up to BATCH, sent as acks come in. So a
 * quiet signal arrives without delay, and a slow plugin slows its feed instead of filling its memory; meanwhile at most MAX_QUEUE values wait here, the oldest are dropped and the count
 * travels with the next batch. A changed choice or a changed signal resends the list (and current
 * values of newly chosen signals) within a tick.
 */
export class WatchFeed extends Disposable {
  static readonly TICK_MS = 1000
  static readonly BATCH = 1000
  static readonly IN_FLIGHT = 2
  static readonly MAX_QUEUE = 20_000
  static readonly REPORT_TICKS = 60
  private queue: WatchedValue[] = []
  private dropped = 0
  private seq = 0
  private readonly inFlight = new Set<number>()
  private chosen: SignalSelection | undefined
  private watched = new Set<string>()
  private dirty = true
  /** dropped since the last report; reported at most every REPORT_TICKS */
  private unreported = 0
  private ticksSinceReport = WatchFeed.REPORT_TICKS

  constructor(private readonly instanceId: string, private readonly deps: WatchDeps, private readonly send: Send, private readonly report: (text: string) => void = () => {}) {
    super()
    this.own(new SelectedValues(deps.bus, deps.signals, () => deps.selection(instanceId), (signal, message) => this.value(signal, message)))
    const changed = () => (this.dirty = true)
    for (const event of ["registered", "unregistered", "updated"] as const) this.listen(deps.signals, event, changed)
    if (deps.changes) this.listen(deps.changes, "changed", (consumer: string) => consumer === instanceId && this.tick())
    this.every(WatchFeed.TICK_MS, () => this.tick())
    this.tick()
  }

  /** the plugin handled a batch */
  ack(seq: number) {
    if (this.inFlight.delete(seq)) this.flush()
  }

  private tick() {
    const selection = this.deps.selection(this.instanceId)
    if (this.dirty || selection !== this.chosen) this.resend(selection)
    this.flush()
    if (this.unreported > 0 && ++this.ticksSinceReport >= WatchFeed.REPORT_TICKS) {
      this.report(`the plugin is behind: ${this.unreported} watched values were dropped`)
      this.unreported = 0
      this.ticksSinceReport = 0
    }
  }

  // the list first, then the current values of what wasn't watched before
  private resend(selection: SignalSelection) {
    this.chosen = selection
    this.dirty = false
    const signals = this.deps.signals.list().filter(signal => selection.includes(signal))
    this.send({ type: "watch.signals", signals: signals.map(WatchFeed.describe) })
    const added = signals.filter(signal => !this.watched.has(signal.id))
    this.watched = new Set(signals.map(signal => signal.id))
    for (const signal of added) {
      const current = this.deps.bus.current(signal.topic)
      // a forced actuator's current value is its forced command; others have none (no retained state)
      if (current?.value) this.push({ ...WatchFeed.toValue(signal, current, current.value), initial: true })
    }
  }

  private value(signal: Signal, message: BusMessage & { value: NonNullable<BusMessage["value"]> }) {
    // a replay after a restart or rename is no change; the current value went out as initial
    if (message.flags?.restored || !this.watched.has(signal.id)) return
    this.push(WatchFeed.toValue(signal, message, message.value))
    this.flush()
  }

  private push(value: WatchedValue) {
    if (this.queue.length >= WatchFeed.MAX_QUEUE) {
      // dropping a chunk at once keeps this cheap while the plugin lags far behind
      const drop = WatchFeed.BATCH
      this.queue.splice(0, drop)
      this.dropped += drop
      this.unreported += drop
    }
    this.queue.push(value)
  }

  private flush() {
    while (this.queue.length > 0 && this.inFlight.size < WatchFeed.IN_FLIGHT) {
      const values = this.queue.splice(0, WatchFeed.BATCH)
      const seq = this.seq++
      this.inFlight.add(seq)
      this.send({ type: "watch.values", seq, values, ...(this.dropped ? { dropped: this.dropped } : {}) })
      this.dropped = 0
    }
  }

  private static toValue(signal: Signal, message: BusMessage, value: NonNullable<BusMessage["value"]>): WatchedValue {
    return { signalId: signal.id, ts: message.ts, kind: message.kind === "command" ? "command" : "state", value, ...(message.flags?.forced ? { forced: true } : {}) }
  }

  private static describe(signal: Signal): WatchedSignal {
    return { id: signal.id, topic: signal.topic, label: signal.label, valueType: signal.valueType, ...(signal.owner ? { owner: { ...signal.owner } } : {}) }
  }
}
