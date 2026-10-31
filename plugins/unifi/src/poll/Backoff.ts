/** Waits that double from `first` up to `max` after each failure, and start over after a success. */
export class Backoff {
  private failures = 0

  constructor(private readonly first: number, private readonly max: number) {}

  /** the wait after one more failure, in ms */
  next() {
    return Math.min(this.max, this.first * 2 ** this.failures++)
  }

  reset() {
    this.failures = 0
  }
}
