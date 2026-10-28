import type { Clock } from "@lox-nexus/core"

/**
 * Counts intercommunication messages per second over a sliding window, separately for each
 * direction. One slot per second in a ring, so memory is fixed and recording is O(1); a slot
 * still holding an older second is reset on first use.
 */
export class TrafficMeter {
  private readonly incoming: Int32Array
  private readonly outgoing: Int32Array
  /** which second (epoch s) each slot currently counts */
  private readonly seconds: Float64Array

  /** @param windowSeconds how far back totals() looks */
  constructor(private readonly clock: Clock, readonly windowSeconds: number) {
    this.incoming = new Int32Array(windowSeconds)
    this.outgoing = new Int32Array(windowSeconds)
    this.seconds = new Float64Array(windowSeconds).fill(-1)
  }

  /** a message from the Miniserver */
  received() {
    this.incoming[this.slot()]!++
  }

  /** a message to the Miniserver */
  sent() {
    this.outgoing[this.slot()]!++
  }

  /**
   * messages per direction within the window, the current second included
   * @param nowMs the moment to count back from; pass one reading to several meters so they agree
   */
  totals(nowMs = this.clock.now()): { incoming: number; outgoing: number } {
    const oldest = Math.floor(nowMs / 1000) - this.windowSeconds
    let incoming = 0
    let outgoing = 0
    for (let slot = 0; slot < this.windowSeconds; slot++) {
      if (this.seconds[slot]! <= oldest) continue
      incoming += this.incoming[slot]!
      outgoing += this.outgoing[slot]!
    }
    return { incoming, outgoing }
  }

  private slot() {
    const second = Math.floor(this.clock.now() / 1000)
    const slot = second % this.windowSeconds
    if (this.seconds[slot] !== second) {
      this.seconds[slot] = second
      this.incoming[slot] = 0
      this.outgoing[slot] = 0
    }
    return slot
  }
}
