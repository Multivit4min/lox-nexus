/** Reconnect delays that double from `first` up to `max`, and start over after a success. */
export class Backoff {
  private attempt = 0

  constructor(private readonly first: number, private readonly max: number) {}

  /** the delay before the next attempt, in ms */
  next() {
    return Math.min(this.max, this.first * 2 ** this.attempt++)
  }

  reset() {
    this.attempt = 0
  }
}
