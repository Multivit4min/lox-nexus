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

/** Optional collaborators of EventBus; every one has an in-memory or system default. */
export interface EventBusOptions {
  clock?: Clock
  chain?: CausalChain
  forces?: ForceStore
  /** declared kind per topic (usually the SignalRegistry), for delivering forced values */
  topicKinds?: TopicKinds
}

/** Source of messages the bus itself produces (expiring forces, restored values, error events). */
const SYSTEM: MessageSource = { kind: "system", id: "bus" }
/** Topic of the events that report handler and processing failures. */
export const BUS_ERROR_TOPIC = "system/bus/error"

/**
 * The message bus. Messages are processed one at a time from a FIFO queue that is never
 * re-entered: anything published by a handler runs after the current message, so effects
 * always follow their causes and order per topic is preserved. Nothing thrown while processing
 * a message escapes: it becomes an event on system/bus/error and the queue keeps draining.
 *
 * Boot order: restoreForces() before restoreSnapshot(), so restored values arrive shadowed
 * instead of briefly reaching subscribers before the force applies.
 *
 * Processing is synchronous: a publish from outside any handler is fully delivered before the
 * call returns. Publishing to an invalid topic throws RangeError; a disposed bus ignores messages.
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

  /** The forces are loaded from the ForceStore later, by restoreForces(), not here. */
  constructor(options: EventBusOptions = {}) {
    super()
    this.clock = options.clock ?? new SystemClock()
    this.chain = options.chain ?? new CausalChain()
    this.forces = this.own(new ForceRegistry(options.forces ?? new InMemoryForceStore(), this.clock,
      topic => this.release(topic, "system", "expired", SYSTEM)))
    this.processor = new BusProcessor(this.chain, this.clock, this.retained, this.forces, this.subscribers, options.topicKinds)
  }

  /** Publishes a state: retained, and dropped if equal to the current value unless `options.force`. */
  publish(topic: string, value: Value, options: PublishOptions) {
    this.enqueue({ kind: "state", topic, value, options })
  }

  /** Publishes an instruction to a target. Never retained or deduped, so repeated pulses all arrive. */
  command(topic: string, value: Value, options: PublishOptions) {
    this.enqueue({ kind: "command", topic, value, options })
  }

  /** Reports how a command went; `durationMs` is in milliseconds. */
  result(topic: string, outcome: { ok: boolean; error?: string; durationMs: number }, options: PublishOptions) {
    this.enqueue({ kind: "result", topic, options, extra: { outcome } })
  }

  /** Publishes a diagnostic message that only exists to be seen (inspector, logs). */
  event(topic: string, text: string, options: PublishOptions) {
    this.enqueue({ kind: "event", topic, options, extra: { text } })
  }

  /**
   * pins a topic to a value until released (or until info.until, which must lie in the future).
   * @throws RangeError for an expiry in the past or an invalid topic
   */
  force(topic: string, value: Value, info: ForceInfo, source: MessageSource = { kind: "user", id: info.by }) {
    if (info.until !== undefined && info.until <= this.clock.now()) throw new RangeError("a force must not expire in the past")
    this.enqueue({ kind: "force", topic, value, options: { source }, extra: { force: info } })
  }

  /**
   * Delivers an active force again, as when it was set (same value, author, reason, expiry and start
   * time), e.g. to an actuator whose plugin restarted and may have lost the forced command.
   * @returns false when the topic isn't forced (or its force has expired)
   */
  replayForce(topic: string, source: MessageSource = SYSTEM) {
    const record = this.forces.get(topic)
    if (!record || (record.until !== undefined && record.until <= this.clock.now())) return false
    const { value, by, reason, until, at, kind } = record
    const info = { by, at, kind, ...(reason === undefined ? {} : { reason }), ...(until === undefined ? {} : { until }) }
    this.enqueue({ kind: "force", topic, value, options: { source, flags: { replayed: true } }, extra: { force: info } })
    return true
  }

  /** Lifts a force and restores the last real value. Does nothing if the topic is not forced. @param reason shown in the inspector, e.g. "expired" */
  release(topic: string, by: string, reason?: string, source: MessageSource = { kind: "user", id: by }) {
    this.enqueue({ kind: "release", topic, options: { source }, extra: reason === undefined ? undefined : { text: reason } })
  }

  /**
   * Delivers state, command, result and event messages matching an MQTT-style pattern (`+`, `#`).
   * @throws RangeError for an invalid pattern
   * @returns a handle whose dispose() unsubscribes
   */
  subscribe(pattern: string, handler: MessageHandler): DisposableLike {
    return this.subscribers.subscribe(pattern, handler)
  }

  /** sees every recorded message, including shadowed publishes, forces and releases */
  tap(handler: MessageHandler): DisposableLike {
    return this.subscribers.tap(handler)
  }

  /** the value subscribers currently see for the topic, which is the forced one while forced */
  current(topic: string): BusMessage | undefined {
    return this.retained.effective(topic)
  }

  /** the last real (unforced) message of the topic, also while it is forced; what a release would restore */
  real(topic: string): BusMessage | undefined {
    return this.retained.real(topic)
  }

  /**
   * Epoch ms when a state last arrived on the topic, counting the equal repeats the bus drops (a
   * Miniserver's resends, a plugin's emit on every poll); restored values don't count. Undefined
   * until one arrived after the start. What stale warnings go by.
   */
  lastSeen(topic: string): number | undefined {
    return this.retained.lastSeen(topic)
  }

  /** the last command delivered to a topic (an actuator's last sent value); for display only, never replayed */
  lastCommand(topic: string): BusMessage | undefined {
    return this.processor.lastCommands.get(topic)
  }

  /** @throws RangeError for an invalid pattern */
  lastCommandsMatching(pattern: string): BusMessage[] {
    Topic.assertValidPattern(pattern)
    return this.processor.lastCommands.matching(pattern)
  }

  /**
   * the current message of every topic matching the pattern, e.g. for a client that just
   * connected and needs the state before it sees changes
   * @throws RangeError for an invalid pattern
   */
  currentMatching(pattern: string): BusMessage[] {
    Topic.assertValidPattern(pattern)
    return [...this.retained.effectiveAll()].filter(message => Topic.matches(pattern, message.topic))
  }

  /**
   * Drops the retained values of topics that no longer exist (a deleted signal or Miniserver), so
   * they disappear from current(), currentMatching() and the snapshot. Forced topics are skipped:
   * release them first. Nothing is delivered to subscribers.
   * @throws RangeError for an invalid pattern
   * @returns the forgotten topics
   */
  forget(pattern: string): string[] {
    Topic.assertValidPattern(pattern)
    const topics = this.retained.topicNames().filter(topic => Topic.matches(pattern, topic) && !this.forces.get(topic))
    for (const topic of topics) this.retained.forget(topic)
    for (const topic of this.processor.lastCommands.topics()) {
      if (Topic.matches(pattern, topic) && !this.forces.get(topic)) this.processor.lastCommands.forget(topic)
    }
    return topics
  }

  /** all forces currently applied, for the inspector and API */
  activeForces() {
    return this.forces.list()
  }

  /** replays a snapshot taken by pendingSnapshot(); messages are flagged restored and are not written back as dirty */
  restoreSnapshot(entries: SnapshotEntry[]) {
    for (const entry of entries) this.publish(entry.topic, entry.value, { source: SYSTEM, flags: { restored: true } })
  }

  /** re-applies persisted forces after a restart; expired ones are dropped from the store. Call before restoreSnapshot(). */
  restoreForces() {
    for (const record of this.forces.loadPersisted()) {
      const { topic, value, ...info } = record
      this.enqueue({ kind: "force", topic, value, options: { source: SYSTEM, flags: { restored: true } }, extra: { force: info } })
    }
  }

  /**
   * Real values changed since the last confirmSnapshot() (live changes only, not restored ones).
   * Two-phase so a failed write loses nothing: persist these, then confirm them.
   */
  pendingSnapshot(): SnapshotEntry[] {
    return this.retained.pending()
  }

  /** marks a pendingSnapshot() as persisted; topics that changed meanwhile stay pending */
  confirmSnapshot(entries: readonly SnapshotEntry[]) {
    this.retained.confirm(entries)
  }

  // The queue is drained by whoever finds it idle; messages published meanwhile wait their turn.
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

  // a failure while reporting a failure is dropped: otherwise a broken error subscriber would loop forever
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
