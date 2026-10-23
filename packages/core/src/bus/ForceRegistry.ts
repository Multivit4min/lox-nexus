import { Disposable } from "@lox-nexus/plugin-sdk"
import type { Clock } from "./Clock.ts"
import type { ForceRecord, ForceStore } from "./ForceStore.ts"

/**
 * Active forces, their persistence and their automatic expiry. Expiry timers are owned through
 * Disposable, so disposing the bus cancels them; the store is written before memory changes.
 */
export class ForceRegistry extends Disposable {
  private readonly active = new Map<string, ForceRecord>()
  private readonly cancels = new Map<string, () => void>()

  /** @param onExpire called when a force's `until` is reached; the bus uses it to release the topic */
  constructor(
    private readonly store: ForceStore,
    private readonly clock: Clock,
    private readonly onExpire: (topic: string) => void
  ) {
    super()
  }

  /** the active force on the topic, if any */
  get(topic: string) {
    return this.active.get(topic)
  }

  /** snapshot of all active forces */
  list(): ForceRecord[] {
    return [...this.active.values()]
  }

  /** persisted forces that haven't expired yet; expired ones are removed from the store */
  loadPersisted(): ForceRecord[] {
    const now = this.clock.now()
    return this.store.load().filter(record => {
      const alive = record.until === undefined || record.until > now
      if (!alive) this.store.delete(record.topic)
      return alive
    })
  }

  /**
   * Replaces any existing force on the topic and (re)starts its expiry.
   * persists first, so a failing store leaves nothing half-forced in memory.
   * @throws whatever the ForceStore throws
   */
  set(record: ForceRecord) {
    this.store.save(record)
    this.cancel(record.topic)
    this.active.set(record.topic, record)
    if (record.until !== undefined) this.schedule(record)
  }

  /** @returns false if the topic was not forced; the store is only touched for active forces */
  delete(topic: string) {
    if (!this.active.has(topic)) return false
    this.store.delete(topic)
    this.cancel(topic)
    return this.active.delete(topic)
  }

  // after() handles delays beyond setTimeout's limit; the clock is re-checked because the injected
  // clock and the timers can drift apart (e.g. a fake clock in tests, or system time changes).
  private schedule(record: ForceRecord) {
    const remaining = Math.max(0, (record.until ?? 0) - this.clock.now())
    const cancel = this.after(remaining, () => {
      this.cancels.delete(record.topic)
      if (this.active.get(record.topic) !== record) return
      if (this.clock.now() >= (record.until ?? 0)) this.onExpire(record.topic)
      else this.schedule(record)
    })
    this.cancels.set(record.topic, cancel)
  }

  private cancel(topic: string) {
    this.cancels.get(topic)?.()
    this.cancels.delete(topic)
  }
}
