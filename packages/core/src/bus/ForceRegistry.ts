import type { DisposableLike } from "@lox-nexus/plugin-sdk"
import type { Clock } from "./Clock.ts"
import type { ForceRecord, ForceStore } from "./ForceStore.ts"

/** Active forces, their persistence and their automatic expiry. */
export class ForceRegistry implements DisposableLike {
  private readonly active = new Map<string, ForceRecord>()
  private readonly timers = new Map<string, NodeJS.Timeout>()

  constructor(
    private readonly store: ForceStore,
    private readonly clock: Clock,
    private readonly onExpire: (topic: string) => void
  ) {}

  get(topic: string) {
    return this.active.get(topic)
  }

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

  set(record: ForceRecord) {
    this.clearTimer(record.topic)
    this.active.set(record.topic, record)
    this.store.save(record)
    if (record.until !== undefined) {
      const timer = setTimeout(() => this.onExpire(record.topic), Math.max(0, record.until - this.clock.now()))
      timer.unref?.()
      this.timers.set(record.topic, timer)
    }
  }

  delete(topic: string) {
    this.clearTimer(topic)
    this.store.delete(topic)
    return this.active.delete(topic)
  }

  dispose() {
    for (const topic of this.timers.keys()) this.clearTimer(topic)
  }

  private clearTimer(topic: string) {
    clearTimeout(this.timers.get(topic))
    this.timers.delete(topic)
  }
}
