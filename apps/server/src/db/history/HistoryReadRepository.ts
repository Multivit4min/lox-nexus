import type { Database } from "../Database.ts"

/** A stored change, as read back. */
export interface RawRow {
  ts: number
  num: number | null
  text: string | null
  flags: number
}

/** A stored bucket, as read back. */
export interface BucketRow {
  start: number
  min: number | null
  max: number | null
  wsum: number
  wdur: number
  n: number
  last: number | null
  flags: number
}

/** Reads history.db for charts and statistics. Every read follows a primary key range. */
export class HistoryReadRepository {
  constructor(private readonly db: Database) {}

  /** undefined for a signal without history */
  series(signalId: string) {
    return this.db.get<{ id: number; valueType: string }>("SELECT id, value_type AS valueType FROM series WHERE signal_id = :signalId", { signalId })
  }

  /** counts up to `max` + 1 rows only, so a long range of a busy signal costs no more than a chart page */
  countRaw(series: number, from: number, to: number, max: number) {
    return this.db.get<{ n: number }>(
      "SELECT count(*) AS n FROM (SELECT 1 FROM samples WHERE series = :series AND ts >= :from AND ts < :to LIMIT :limit)",
      { series, from, to, limit: max + 1 }
    )!.n
  }

  raw(series: number, from: number, to: number, limit: number) {
    return this.db.all<RawRow>("SELECT ts, num, text, flags FROM samples WHERE series = :series AND ts >= :from AND ts < :to ORDER BY ts LIMIT :limit", { series, from, to, limit })
  }

  rawBefore(series: number, before: number) {
    return this.db.get<RawRow>("SELECT ts, num, text, flags FROM samples WHERE series = :series AND ts < :before ORDER BY ts DESC LIMIT 1", { series, before })
  }

  buckets(series: number, width: number, from: number, to: number) {
    return this.db.all<BucketRow>(
      "SELECT start, min, max, wsum, wdur, n, last, flags FROM buckets WHERE series = :series AND width = :width AND start >= :from AND start < :to ORDER BY start",
      { series, width, from, to }
    )
  }

  bucketBefore(series: number, width: number, before: number) {
    return this.db.get<BucketRow>(
      "SELECT start, min, max, wsum, wdur, n, last, flags FROM buckets WHERE series = :series AND width = :width AND start < :before ORDER BY start DESC LIMIT 1",
      { series, width, before }
    )
  }

  /** whether Nexus ran (and recorded) at some time before `before`: then a gap at a range's start is real downtime */
  ranBefore(before: number) {
    return this.db.get("SELECT 1 FROM runs WHERE seen < :before LIMIT 1", { before }) !== undefined
  }

  /** the times the signal wasn't recorded that overlap the range, oldest first; `resumed` null while it still isn't */
  pauses(signalId: string, from: number, to: number) {
    return this.db.all<{ stopped: number; resumed: number | null }>(
      "SELECT stopped, resumed FROM pauses WHERE signal_id = :signalId AND stopped < :to AND (resumed IS NULL OR resumed > :from) ORDER BY stopped",
      { signalId, from, to }
    )
  }

  /** the runs of Nexus that overlap the range, oldest first */
  runs(from: number, to: number) {
    return this.db.all<{ started: number; seen: number }>("SELECT started, seen FROM runs WHERE started < :to AND seen >= :from ORDER BY started", { from, to })
  }

  /**
   * Rows written since `since` per tier, and the number of series. Seeks each series' recent end
   * along the primary key, so it costs what was written since, never the whole table: keep `since`
   * recent (an hour), since a synchronous read blocks Nexus meanwhile.
   */
  recent(since: number, widths: readonly [number, number]) {
    const [fine, coarse] = widths
    return this.db.get<Record<"series" | "raw" | "fine" | "coarse", number>>(
      `SELECT
         (SELECT count(*) FROM series) AS series,
         coalesce((SELECT sum((SELECT count(*) FROM samples WHERE series = s.id AND ts >= :since)) FROM series s), 0) AS raw,
         coalesce((SELECT sum((SELECT count(*) FROM buckets WHERE series = s.id AND width = :fine AND start >= :since)) FROM series s), 0) AS fine,
         coalesce((SELECT sum((SELECT count(*) FROM buckets WHERE series = s.id AND width = :coarse AND start >= :since)) FROM series s), 0) AS coarse`,
      { since, fine, coarse }
    )!
  }
}
