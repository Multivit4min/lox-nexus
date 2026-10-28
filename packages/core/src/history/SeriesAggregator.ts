import { BucketAccumulator } from "./BucketAccumulator.ts"
import type { BucketDelta, BucketPart } from "./HistoryTypes.ts"

/** The buckets of every recorded signal, in each width. */
export class SeriesAggregator {
  static readonly FIVE_MINUTES = 5 * 60_000
  static readonly HOUR = 60 * 60_000
  static readonly WIDTHS = [SeriesAggregator.FIVE_MINUTES, SeriesAggregator.HOUR] as const
  private readonly series = new Map<string, { valueType: string; accumulators: BucketAccumulator[] }>()
  private ended: BucketDelta[] = []

  add(signalId: string, valueType: string, ts: number, value: number | null, flags: number) {
    let entry = this.series.get(signalId)
    if (!entry) this.series.set(signalId, entry = { valueType, accumulators: SeriesAggregator.WIDTHS.map(width => new BucketAccumulator(width)) })
    for (const accumulator of entry.accumulators) this.keep(signalId, entry.valueType, accumulator.set(ts, value, flags))
  }

  /**
   * The bucket parts to write: those of ended buckets, and with `partial` also what the open ones
   * got so far (they merge with later parts of the same bucket in the store).
   */
  drain(now: number, partial: boolean): BucketDelta[] {
    if (partial) {
      for (const [signalId, { valueType, accumulators }] of this.series) {
        for (const accumulator of accumulators) this.keep(signalId, valueType, accumulator.drain(now))
      }
    }
    const out = this.ended
    this.ended = []
    return out
  }

  /** a deleted signal: its open buckets are dropped, so they don't bring its history back */
  forget(signalId: string) {
    this.series.delete(signalId)
  }

  /**
   * A signal that is no longer recorded: its open buckets are closed at `now` and handed out with
   * the next drain. Without this its last value would be carried into the buckets after a gap
   * nobody knows anything about, once it is recorded again.
   */
  release(signalId: string, now: number) {
    const entry = this.series.get(signalId)
    if (!entry) return
    for (const accumulator of entry.accumulators) this.keep(signalId, entry.valueType, accumulator.drain(now))
    this.series.delete(signalId)
  }

  /** whether the signal has open buckets */
  has(signalId: string) {
    return this.series.has(signalId)
  }

  private keep(signalId: string, valueType: string, parts: BucketPart[]) {
    for (const part of parts) this.ended.push({ ...part, signalId, valueType })
  }
}
