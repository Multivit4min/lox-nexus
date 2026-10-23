/**
 * One unref'd interval (so it never keeps the process alive); a bare setInterval is acceptable here
 * because the owner (RemotePeer) calls stop() and ici must not depend on the workspace Disposable.
 * Mirrors the Miniserver's global resend tick: one timer, not one per output.
 */
export class ResendScheduler {
  private timer: NodeJS.Timeout | undefined

  /** intervalMs 0 disables resends; NaN or negative values are rejected (NaN would mean every 1 ms) */
  constructor(intervalMs: number, tick: () => void) {
    if (!Number.isFinite(intervalMs) || intervalMs < 0) throw new RangeError(`resend interval must be >= 0 ms, got ${intervalMs}`)
    if (intervalMs === 0) return
    this.timer = setInterval(tick, intervalMs)
    this.timer.unref?.()
  }

  /** false when disabled with 0 or after stop() */
  get isRunning() {
    return this.timer !== undefined
  }

  /** idempotent */
  stop() {
    clearInterval(this.timer)
    this.timer = undefined
  }
}
