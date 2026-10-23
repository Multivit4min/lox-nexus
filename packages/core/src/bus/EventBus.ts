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
import type { TopicKinds } from "./TopicKinds.ts"

export interface EventBusOptions {
  clock?: Clock
  chain?: CausalChain
  forces?: ForceStore
  /** declared kind per topic (usually the SignalRegistry), for delivering forced values */
  topicKinds?: TopicKinds
}

const SYSTEM: MessageSource = { kind: "system", id: "bus" }
export const BUS_ERROR_TOPIC = "system/bus/error"

/**
 * The message bus. Messages are processed one at a time from a FIFO queue that is never
 * re-entered: anything published by a handler runs after the current message, so effects
 * always follow their causes and order per topic is preserved. Nothing thrown while processing
 * a message escapes: it becomes an event on system/bus/error and the queue keeps draining.
 *
 * Boot order: restoreForces() before restoreSnapshot(), so restored values arrive shadowed
 * instead of briefly reaching subscribers before the force applies.
 */
export class EventBus extends Disposable {
  readonly chain: CausalChain
  private readonly clock: Clock
  private readonly retained = new RetainedState()
  private readonly subscribers = new Subscribers((message, error) => this.handlerFailed(message, error))
  private readonly forces: ForceRegistry
  private readonly processor: BusProcessor
  private readonly queue: Pending[] = []
  private draining = false

  constructor(options: EventBusOptions = {}) {
    super()
    this.clock = options.clock ?? new SystemClock()
    this.chain = options.chain ?? new CausalChain()
    this.forces = this.own(new ForceRegistry(options.forces ?? new InMemoryForceStore(), this.clock,
      topic => this.release(topic, "system", "expired", SYSTEM)))
    this.processor = new BusProcessor(this.chain, this.clock, this.retained, this.forces, this.subscribers, options.topicKinds)
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

  /** pins a topic to a value until released (or until info.until, which must lie in the future) */
  force(topic: string, value: Value, info: ForceInfo, source: MessageSource = { kind: "user", id: info.by }) {
    if (info.until !== undefined && info.until <= this.clock.now()) throw new RangeError("a force must not expire in the past")
    this.enqueue({ kind: "force", topic, value, options: { source }, extra: { force: info } })
  }

  release(topic: string, by: string, reason?: string, source: MessageSource = { kind: "user", id: by }) {
    this.enqueue({ kind: "release", topic, options: { source }, extra: reason === undefined ? undefined : { text: reason } })
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
    if (this.isDisposed) return
    this.queue.push(pending)
    if (this.draining) return
    this.draining = true
    try {
      for (let next = this.queue.shift(); next; next = this.queue.shift()) this.processSafely(next)
    } finally {
      this.draining = false
    }
  }

  private processSafely(pending: Pending) {
    try {
      this.processor.process(pending)
    } catch (error) {
      if (pending.topic === BUS_ERROR_TOPIC) return
      this.event(BUS_ERROR_TOPIC, `processing ${pending.kind} on ${pending.topic} failed: ${EventBus.message(error)}`, { source: SYSTEM, cause: pending.options.cause })
    }
  }

  private handlerFailed(message: BusMessage, error: unknown) {
    if (message.topic === BUS_ERROR_TOPIC) return
    this.event(BUS_ERROR_TOPIC, `handler for ${message.topic} failed: ${EventBus.message(error)}`, { source: SYSTEM, cause: message })
  }

  private static message(error: unknown) {
    return error instanceof Error ? error.message : String(error)
  }
}
