/**
 * Runs an action at most once per `gapMs`: a request within the gap is held and runs once when the
 * gap is over, however many came meanwhile. For reloading a chart on live changes without a
 * request per value of a busy signal.
 */
export class Throttle {
  private last = -Infinity
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly gapMs: number, private readonly action: () => void) {}

  request() {
    if (this.timer) return
    const wait = Math.max(0, this.last + this.gapMs - Date.now())
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.last = Date.now()
      this.action()
    }, wait)
  }

  /** drops a held request */
  cancel() {
    clearTimeout(this.timer)
    this.timer = undefined
  }
}
