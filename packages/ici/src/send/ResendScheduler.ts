/** One unref'd interval for all outputs of a peer, mirroring the Miniserver's global resend tick. */
export class ResendScheduler {
  private timer: NodeJS.Timeout | undefined

  constructor(intervalMs: number, tick: () => void) {
    if (intervalMs <= 0) return
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
