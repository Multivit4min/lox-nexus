import type { BucketRow } from "../db/history/HistoryReadRepository.ts"

/** Merges stored buckets into wider ones: `factor` neighbours (aligned to factor x width) into one, as the store merges parts. */
export class BucketMerge {
  static by(rows: readonly BucketRow[], width: number, factor: number): BucketRow[] {
    if (factor <= 1) return [...rows]
    const span = width * factor
    const merged: BucketRow[] = []
    for (const row of rows) {
      const start = Math.floor(row.start / span) * span
      const last = merged.at(-1)
      if (last?.start !== start) {
        merged.push({ ...row, start })
        continue
      }
      last.min = BucketMerge.pick(Math.min, last.min, row.min)
      last.max = BucketMerge.pick(Math.max, last.max, row.max)
      last.wsum += row.wsum
      last.wdur += row.wdur
      last.n += row.n
      last.last = row.last
      last.flags |= row.flags
    }
    return merged
  }

  private static pick(choose: (a: number, b: number) => number, a: number | null, b: number | null) {
    return a === null ? b : b === null ? a : choose(a, b)
  }
}
