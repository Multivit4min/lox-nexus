import type { BucketDelta, HistorySample, HistoryStore, HistoryTier, PauseChange } from "../HistoryTypes.ts"

/** Keeps writes in memory for tests; `fail` makes writes throw, `rows` is what prune/purge report deleting. */
export class MemoryHistoryStore implements HistoryStore {
  samples: HistorySample[] = []
  buckets: BucketDelta[] = []
  runs: Array<{ started: number; seen: number }> = []
  pauses: PauseChange[] = []
  /** what pausedSignals() reports, as if left by an earlier run */
  paused: string[] = []
  fail = false
  rows = 0
  ids = ["temp", "gone"]
  pruned: Array<[HistoryTier, number, number]> = []
  purged: Array<[string, number]> = []

  write(batch: Parameters<HistoryStore["write"]>[0]) {
    if (this.fail) throw new Error("disk full")
    this.samples.push(...batch.samples)
    this.buckets.push(...batch.buckets)
    this.pauses.push(...batch.pauses ?? [])
    this.runs.push(batch.run)
  }

  prune(tier: HistoryTier, before: number, limit: number) {
    this.pruned.push([tier, before, limit])
    return Math.min(this.rows, limit)
  }

  pausedSignals() {
    return this.paused
  }

  seriesIds() {
    return this.ids
  }

  purge(signalId: string, limit: number) {
    this.purged.push([signalId, limit])
    return 0
  }
}
