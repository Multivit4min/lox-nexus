import type { Clock } from "../lifecycle/Clock.ts"

/**
 * Fires at once, then at most once per `ms`: calls within that time fire once when it ends. For
 * messages where only the latest matters (progress, "the panel changed").
 */
export class TrailingThrottle {
  private quietUntil = 0
  private timer: unknown
  private closed = false

  constructor(private readonly clock: Clock, private readonly ms: number, private readonly fire: () => void) {}

  call() {
    if (this.closed || this.timer !== undefined) return
    const wait = this.quietUntil - this.clock.now()
    if (wait <= 0) return this.run()
    this.timer = this.clock.setTimeout(() => {
      this.timer = undefined
      this.run()
    }, wait)
  }

  /** drops a pending call; later calls do nothing */
  close() {
    this.closed = true
    if (this.timer !== undefined) this.clock.clearTimeout(this.timer)
    this.timer = undefined
  }

  private run() {
    if (this.closed) return
    this.quietUntil = this.clock.now() + this.ms
    this.fire()
  }
}
