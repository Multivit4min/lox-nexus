import type { BucketDelta, HistorySample, HistoryStore, HistoryTier } from "../HistoryTypes.ts"

/** Keeps writes in memory for tests; `fail` makes writes throw, `rows` is what prune/purge report deleting. */
export class MemoryHistoryStore implements HistoryStore {
  samples: HistorySample[] = []
  buckets: BucketDelta[] = []
  runs: Array<{ started: number; seen: number }> = []
  fail = false
  rows = 0
  ids = ["temp", "gone"]
  pruned: Array<[HistoryTier, number, number]> = []
  purged: Array<[string, number]> = []

  write(batch: Parameters<HistoryStore["write"]>[0]) {
    if (this.fail) throw new Error("disk full")
    this.samples.push(...batch.samples)
    this.buckets.push(...batch.buckets)
    this.runs.push(batch.run)
  }

  prune(tier: HistoryTier, before: number, limit: number) {
    this.pruned.push([tier, before, limit])
    return Math.min(this.rows, limit)
  }

  seriesIds() {
    return this.ids
  }

  purge(signalId: string, limit: number) {
    this.purged.push([signalId, limit])
    return 0
  }
}
