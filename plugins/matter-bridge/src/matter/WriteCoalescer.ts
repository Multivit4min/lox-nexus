/** starts a one-shot timer and returns its cancel function (the plugin's `after()`) */
export type Schedule = (ms: number, run: () => void) => () => void

/**
 * Merges store writes that come in bursts (a blind reporting its position every second, a dimmer
 * ramp): the first write of a key schedules a flush, later ones within the delay only replace
 * what is written. A write is never delayed by more than the delay, and flush() writes everything
 * pending at once, e.g. when the plugin stops.
 */
export class WriteCoalescer {
  static readonly DELAY_MS = 1500

  private readonly pending = new Map<string, () => void>()
  private scheduled = false
  private cancel: (() => void) | undefined

  constructor(private readonly schedule: Schedule, private readonly delayMs = WriteCoalescer.DELAY_MS) {}

  /** writes `write` for `key` within the delay; a newer write of the same key replaces it */
  write(key: string, write: () => void) {
    this.pending.set(key, write)
    if (this.scheduled) return
    this.scheduled = true
    // a schedule may run at once (while the plugin stops); flush() has cleared `scheduled` then
    this.cancel = this.schedule(this.delayMs, () => this.flush())
  }

  /** writes everything pending now */
  flush() {
    const cancel = this.cancel
    this.scheduled = false
    this.cancel = undefined
    cancel?.()
    const writes = [...this.pending.values()]
    this.pending.clear()
    for (const write of writes) write()
  }

  get size() {
    return this.pending.size
  }
}
