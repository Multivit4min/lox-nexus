/** Restart delays after crashes: doubling from `initialMs` up to `maxMs`, reset after a stable run. */
export class Backoff {
  private attempt = 0

  constructor(private readonly initialMs = 1000, private readonly maxMs = 300_000) {}

  /** the delay before the next restart; each call doubles the following one */
  next() {
    const delay = Math.min(this.maxMs, this.initialMs * 2 ** this.attempt)
    this.attempt = Math.min(this.attempt + 1, 30)
    return delay
  }

  /** called after a stable run, so an old crash doesn't slow down the next restart */
  reset() {
    this.attempt = 0
  }
}
