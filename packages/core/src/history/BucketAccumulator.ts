import type { BucketPart } from "./HistoryTypes.ts"

/**
 * Time-weighted min/max/average of one signal in buckets of one width. A value holds until the
 * next change, so it is integrated over time: a temperature that changes in bursts isn't skewed
 * towards the bursts. Only buckets with a change in them are handed out; between them the value
 * was constant, which readers know from the previous bucket's `last`. A clock that goes back (a
 * device without a real-time clock syncing its time) is held at the last time seen.
 */
export class BucketAccumulator {
  private start: number | undefined
  private at = 0
  private value: number | null = null
  private part: BucketPart | undefined
  /** the current bucket had a change, so it is written, also in parts */
  private changed = false

  constructor(readonly width: number) {}

  /** a change at `ts`; @returns the buckets that ended before it */
  set(ts: number, value: number | null, flags: number): BucketPart[] {
    const ended = this.advance(ts)
    const part = this.part!
    part.n++
    part.flags |= flags
    if (value !== null) {
      part.min = part.min === null ? value : Math.min(part.min, value)
      part.max = part.max === null ? value : Math.max(part.max, value)
    }
    part.last = value
    this.value = value
    this.changed = true
    return ended
  }

  /** the buckets that ended by `now`, and what the current one got since the last drain if it had a change */
  drain(now: number): BucketPart[] {
    const ended = this.advance(now)
    if (this.changed) ended.push(this.take())
    return ended
  }

  private advance(ts: number): BucketPart[] {
    const now = Math.max(ts, this.at)
    const ended: BucketPart[] = []
    if (this.start === undefined) {
      // the first value holds from when it arrived, not from the bucket's start
      this.open(now)
      this.at = now
      return ended
    }
    if (now >= this.start + this.width) {
      this.integrate(this.start + this.width)
      if (this.changed) ended.push(this.take())
      // buckets in between had no change: the value was constant there, nothing to write
      this.open(now)
    }
    this.integrate(now)
    return ended
  }

  private open(ts: number) {
    this.start = Math.floor(ts / this.width) * this.width
    this.at = this.start
    this.changed = false
    this.part = this.fresh()
  }

  // a new bucket or part starts with the value carried over from before
  private fresh(): BucketPart {
    return { width: this.width, start: this.start!, min: this.value, max: this.value, wsum: 0, wdur: 0, n: 0, last: this.value, flags: 0 }
  }

  private take(): BucketPart {
    const part = this.part!
    this.part = this.fresh()
    return part
  }

  private integrate(to: number) {
    if (this.value !== null && to > this.at) {
      this.part!.wsum += this.value * (to - this.at)
      this.part!.wdur += to - this.at
    }
    this.at = to
  }
}
