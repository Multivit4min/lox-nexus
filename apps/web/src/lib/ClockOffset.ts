/** How far the server's clock is ahead of the browser's (negative: behind), and how sure that is. */
export interface ClockReading {
  offsetMs: number
  /** half the round trip of the measurement: the server read its clock somewhere within it */
  uncertaintyMs: number
}

/**
 * Measures the offset between the server's clock and the browser's, the way NTP does: the server
 * read its clock about halfway through the round trip. Of a few tries, the shortest round trip
 * counts, as it leaves the least room for error.
 */
export class ClockOffset {
  constructor(private readonly serverNow: () => Promise<number>, private readonly now: () => number = () => Date.now()) {}

  async measure(tries = 5): Promise<ClockReading> {
    let best: ClockReading | undefined
    for (let i = 0; i < tries; i++) {
      const sent = this.now()
      const server = await this.serverNow()
      const received = this.now()
      const reading = { offsetMs: server - (sent + received) / 2, uncertaintyMs: (received - sent) / 2 }
      if (!best || reading.uncertaintyMs < best.uncertaintyMs) best = reading
    }
    if (!best) throw new Error("no measurement")
    return best
  }

  /** "3.2 s ahead of this browser", "0.4 s behind this browser", "in step with this browser" */
  static describe(reading: ClockReading) {
    const seconds = Math.abs(reading.offsetMs) / 1000
    if (Math.abs(reading.offsetMs) <= Math.max(100, reading.uncertaintyMs)) return "in step with this browser"
    return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} s ${reading.offsetMs > 0 ? "ahead of" : "behind"} this browser`
  }
}
