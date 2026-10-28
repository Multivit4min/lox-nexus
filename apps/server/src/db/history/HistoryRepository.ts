import type { BucketDelta, HistorySample, HistoryStore, HistoryTier } from "@lox-nexus/core"
import type { Database } from "../Database.ts"

/**
 * Writes and cleans up history.db for HistoryRecorder and HistoryRetention. Bucket parts merge
 * with what a bucket already has (min/max combine, sums add up, last is replaced), so a bucket
 * written in parts, or across a restart, ends up whole.
 */
export class HistoryRepository implements HistoryStore {
  private readonly ids = new Map<string, number>()

  constructor(private readonly db: Database) {}

  write(batch: Parameters<HistoryStore["write"]>[0]) {
    try {
      this.db.transaction(() => {
        for (const sample of batch.samples) this.insertSample(sample)
        for (const bucket of batch.buckets) this.mergeBucket(bucket)
        this.db.run("INSERT INTO runs (started, seen) VALUES (:started, :seen) ON CONFLICT (started) DO UPDATE SET seen = max(seen, excluded.seen)", batch.run)
      })
    } catch (error) {
      // series created in the rolled-back transaction are gone again
      this.ids.clear()
      throw error
    }
  }

  // per series along the primary key, so no scan of the whole table; one transaction, so a
  // round over hundreds of series isn't hundreds of commits; stops at `limit` rows
  prune(tier: HistoryTier, before: number, limit: number) {
    return this.db.transaction(() => {
      let deleted = 0
      for (const { id } of this.db.all<{ id: number }>("SELECT id FROM series ORDER BY id")) {
        if (deleted >= limit) break
        deleted += this.deleteRows(id, tier, before, limit - deleted)
      }
      return deleted
    })
  }

  seriesIds() {
    return this.db.all<{ signal_id: string }>("SELECT signal_id FROM series").map(row => row.signal_id)
  }

  purge(signalId: string, limit: number) {
    const id = this.db.get<{ id: number }>("SELECT id FROM series WHERE signal_id = :signalId", { signalId })?.id
    if (id === undefined) return 0
    const deleted = this.deleteRows(id, "raw", Number.MAX_SAFE_INTEGER, limit)
    const buckets = this.db.run("DELETE FROM buckets WHERE (series, width, start) IN (SELECT series, width, start FROM buckets WHERE series = :id LIMIT :limit)", { id, limit: limit - deleted })
    const total = deleted + Number(buckets.changes)
    if (total < limit) {
      this.db.run("DELETE FROM series WHERE id = :id", { id })
      this.ids.delete(signalId)
    }
    return total
  }

  private deleteRows(id: number, tier: HistoryTier, before: number, limit: number) {
    const result = tier === "raw"
      ? this.db.run("DELETE FROM samples WHERE (series, ts) IN (SELECT series, ts FROM samples WHERE series = :id AND ts < :before LIMIT :limit)", { id, before, limit })
      : this.db.run(
        "DELETE FROM buckets WHERE (series, width, start) IN (SELECT series, width, start FROM buckets WHERE series = :id AND width = :width AND start < :before LIMIT :limit)",
        { id, width: tier, before, limit }
      )
    return Number(result.changes)
  }

  // two values within one millisecond: the later one stays
  private insertSample(sample: HistorySample) {
    this.db.run(
      `INSERT INTO samples (series, ts, num, text, flags) VALUES (:series, :ts, :num, :text, :flags)
       ON CONFLICT (series, ts) DO UPDATE SET num = excluded.num, text = excluded.text, flags = excluded.flags`,
      { series: this.seriesId(sample.signalId, sample.valueType, sample.ts), ts: sample.ts, num: sample.num, text: sample.text, flags: sample.flags }
    )
  }

  private mergeBucket(bucket: BucketDelta) {
    const { width, start, min, max, wsum, wdur, n, last, flags } = bucket
    this.db.run(
      `INSERT INTO buckets (series, width, start, min, max, wsum, wdur, n, last, flags) VALUES (:series, :width, :start, :min, :max, :wsum, :wdur, :n, :last, :flags)
       ON CONFLICT (series, width, start) DO UPDATE SET
         min = coalesce(min(min, excluded.min), min, excluded.min), max = coalesce(max(max, excluded.max), max, excluded.max),
         wsum = wsum + excluded.wsum, wdur = wdur + excluded.wdur, n = n + excluded.n, last = excluded.last, flags = flags | excluded.flags`,
      { series: this.seriesId(bucket.signalId, bucket.valueType, start), width, start, min, max, wsum, wdur, n, last, flags }
    )
  }

  private seriesId(signalId: string, valueType: string, created: number) {
    let id = this.ids.get(signalId)
    if (id === undefined) {
      this.db.run("INSERT OR IGNORE INTO series (signal_id, value_type, created) VALUES (:signalId, :valueType, :created)", { signalId, valueType, created })
      id = this.db.get<{ id: number }>("SELECT id FROM series WHERE signal_id = :signalId", { signalId })!.id
      this.ids.set(signalId, id)
    }
    return id
  }
}
