import { Disposable } from "@lox-nexus/plugin-sdk"
import type { Clock } from "./Clock.ts"
import type { ForceRecord, ForceStore } from "./ForceStore.ts"

/** Active forces, their persistence and their automatic expiry. */
export class ForceRegistry extends Disposable {
  /** setTimeout fires after 1 ms for longer delays, so long expiries are scheduled in steps */
  static readonly MAX_TIMER_MS = 2_147_483_647
  private readonly active = new Map<string, ForceRecord>()
  private readonly cancels = new Map<string, () => void>()

  constructor(
    private readonly store: ForceStore,
    private readonly clock: Clock,
    private readonly onExpire: (topic: string) => void
  ) {
    super()
  }

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

  /** persists first, so a failing store leaves nothing half-forced in memory */
  set(record: ForceRecord) {
    this.store.save(record)
    this.cancel(record.topic)
    this.active.set(record.topic, record)
    if (record.until !== undefined) this.schedule(record)
  }

  delete(topic: string) {
    if (!this.active.has(topic)) return false
    this.store.delete(topic)
    this.cancel(topic)
    return this.active.delete(topic)
  }

  private schedule(record: ForceRecord) {
    const remaining = Math.max(0, (record.until ?? 0) - this.clock.now())
    const cancel = this.after(Math.min(remaining, ForceRegistry.MAX_TIMER_MS), () => {
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
