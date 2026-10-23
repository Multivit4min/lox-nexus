import { Disposable, type DisposableLike } from "@lox-nexus/plugin-sdk"
import type { Value } from "@lox-nexus/plugin-sdk/values"
import { BusProcessor } from "./BusProcessor.ts"
import type { BusMessage, ForceInfo, MessageSource } from "./BusMessage.ts"
import { CausalChain } from "./CausalChain.ts"
import { SystemClock, type Clock } from "./Clock.ts"
import { ForceRegistry } from "./ForceRegistry.ts"
import { InMemoryForceStore, type ForceStore } from "./ForceStore.ts"
import type { Pending, PublishOptions } from "./Pending.ts"
import { RetainedState, type SnapshotEntry } from "./RetainedState.ts"
import { Subscribers, type MessageHandler } from "./Subscribers.ts"
import { Topic } from "./Topic.ts"

export interface EventBusOptions {
  clock?: Clock
  chain?: CausalChain
  forces?: ForceStore
}

const SYSTEM: MessageSource = { kind: "system", id: "bus" }
export const BUS_ERROR_TOPIC = "system/bus/error"

/**
 * The message bus. Messages are processed one at a time from a FIFO queue that is never
 * re-entered: anything published by a handler runs after the current message, so effects
 * always follow their causes and order per topic is preserved.
 */
export class EventBus extends Disposable {
  readonly chain: CausalChain
  private readonly retained = new RetainedState()
  private readonly subscribers = new Subscribers((message, error) => this.handlerFailed(message, error))
  private readonly forces: ForceRegistry
  private readonly processor: BusProcessor
  private readonly queue: Pending[] = []
  private draining = false

  constructor(options: EventBusOptions = {}) {
    super()
    const clock = options.clock ?? new SystemClock()
    this.chain = options.chain ?? new CausalChain()
    this.forces = this.own(new ForceRegistry(options.forces ?? new InMemoryForceStore(), clock,
      topic => this.release(topic, "system", "expired")))
    this.processor = new BusProcessor(this.chain, clock, this.retained, this.forces, this.subscribers)
  }

  publish(topic: string, value: Value, options: PublishOptions) {
    this.enqueue({ kind: "state", topic, value, options })
  }

  command(topic: string, value: Value, options: PublishOptions) {
    this.enqueue({ kind: "command", topic, value, options })
  }

  result(topic: string, outcome: { ok: boolean; error?: string; durationMs: number }, options: PublishOptions) {
    this.enqueue({ kind: "result", topic, options, extra: { outcome } })
  }

  event(topic: string, text: string, options: PublishOptions) {
    this.enqueue({ kind: "event", topic, options, extra: { text } })
  }

  /** pins a topic to a value until released (or until info.until) */
  force(topic: string, value: Value, info: ForceInfo, source: MessageSource = { kind: "user", id: info.by }) {
    this.enqueue({ kind: "force", topic, value, options: { source }, extra: { force: info } })
  }

  release(topic: string, by: string, reason?: string) {
    this.enqueue({ kind: "release", topic, options: { source: { kind: by === "system" ? "system" : "user", id: by } }, extra: { text: reason } })
  }

  subscribe(pattern: string, handler: MessageHandler): DisposableLike {
    return this.subscribers.subscribe(pattern, handler)
  }

  /** sees every recorded message, including shadowed publishes, forces and releases */
  tap(handler: MessageHandler): DisposableLike {
    return this.subscribers.tap(handler)
  }

  current(topic: string): BusMessage | undefined {
    return this.retained.effective(topic)
  }

  activeForces() {
    return this.forces.list()
  }

  /** replays a snapshot taken by takeSnapshot(); messages are flagged restored */
  restoreSnapshot(entries: SnapshotEntry[]) {
    for (const entry of entries) this.publish(entry.topic, entry.value, { source: SYSTEM, flags: { restored: true } })
  }

  /** re-applies persisted forces after a restart */
  restoreForces() {
    for (const record of this.forces.loadPersisted()) {
      const { topic, value, ...info } = record
      this.enqueue({ kind: "force", topic, value, options: { source: SYSTEM, flags: { restored: true } }, extra: { force: info } })
    }
  }

  /** real values changed since the last call, for periodic persistence */
  takeSnapshot(): SnapshotEntry[] {
    return this.retained.takeDirty()
  }

  private enqueue(pending: Pending) {
    Topic.assertValid(pending.topic)
    this.queue.push(pending)
    if (this.draining) return
    this.draining = true
    try {
      for (let next = this.queue.shift(); next; next = this.queue.shift()) this.processor.process(next)
    } finally {
      this.draining = false
    }
  }

  private handlerFailed(message: BusMessage, error: unknown) {
    if (message.topic === BUS_ERROR_TOPIC) return
    const text = error instanceof Error ? error.message : String(error)
    this.event(BUS_ERROR_TOPIC, `handler for ${message.topic} failed: ${text}`, { source: SYSTEM, cause: message })
  }
}
