/** One unref'd interval for all outputs of a peer, mirroring the Miniserver's global resend tick. */
export class ResendScheduler {
  private timer: NodeJS.Timeout | undefined

  /** intervalMs 0 disables resends; NaN or negative values are rejected (NaN would mean every 1 ms) */
  constructor(intervalMs: number, tick: () => void) {
    if (!Number.isFinite(intervalMs) || intervalMs < 0) throw new RangeError(`resend interval must be >= 0 ms, got ${intervalMs}`)
    if (intervalMs === 0) return
    this.timer = setInterval(tick, intervalMs)
    this.timer.unref?.()
  }

  get isRunning() {
    return this.timer !== undefined
  }

  stop() {
    clearInterval(this.timer)
    this.timer = undefined
  }
}
