/** Delays between connection attempts: 1 s, 2 s, 4 s … up to a minute, from the start after a success. */
export class Backoff {
  static readonly MIN_MS = 1000
  static readonly MAX_MS = 60_000
  private attempt = 0

  next() {
    const ms = Math.min(Backoff.MAX_MS, Backoff.MIN_MS * 2 ** this.attempt)
    this.attempt = Math.min(this.attempt + 1, 16)
    return ms
  }

  reset() {
    this.attempt = 0
  }
}
