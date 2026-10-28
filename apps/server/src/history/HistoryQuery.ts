import type { BucketPointDto, HistoryGapDto, HistorySeriesDto, HistorySettings, RawPointDto } from "@lox-nexus/api"
import { HistoryFlags, SeriesAggregator, type Clock } from "@lox-nexus/core"
import type { BucketRow, HistoryReadRepository, RawRow } from "../db/history/HistoryReadRepository.ts"
import { BucketMerge } from "./BucketMerge.ts"

const DAY = 24 * 60 * 60_000

/**
 * A signal's history over a range, at the finest resolution that fits: every change while the raw
 * tier still holds the range and it has at most RAW_FACTOR x points changes, else 5-minute buckets
 * while there are at most `points` of them in the range and they are still kept, else 1-hour
 * buckets. Text is only stored raw. Gaps are the times no run of Nexus covers, once history began,
 * and the times the signal wasn't recorded because it had left the selection.
 */
export class HistoryQuery {
  static readonly RAW_FACTOR = 4
  /** a run's `seen` lags up to a minute behind (open buckets are written once a minute) */
  static readonly SLACK_MS = 2 * 60_000
  static readonly TOLERANCE_MS = 60 * 60_000

  constructor(private readonly reader: HistoryReadRepository, private readonly settings: () => HistorySettings, private readonly clock: Clock) {}

  run(signalId: string, valueType: string, query: { from: number; to: number; points: number }): HistorySeriesDto {
    const { from, to, points } = query
    const series = this.reader.series(signalId)
    const gaps = series ? this.gaps(signalId, from, Math.min(to, this.clock.now())) : []
    const base = { signalId, valueType: series?.valueType ?? valueType, from, to, gaps }
    if (!series) return { ...base, resolution: "raw", points: [] }
    const resolution = this.resolution(series, from, to, points)
    if (resolution === "raw") {
      const limit = points * HistoryQuery.RAW_FACTOR
      const rows = this.reader.raw(series.id, from, to, limit + 1)
      const before = this.rawBefore(series.id, from)
      return { ...base, resolution, points: rows.slice(0, limit).map(HistoryQuery.rawPoint), ...(before ? { before } : {}), ...(rows.length > limit ? { truncated: true } : {}) }
    }
    const width = resolution === "5m" ? SeriesAggregator.FIVE_MINUTES : SeriesAggregator.HOUR
    // the bucket `from` falls into belongs to the range, although it starts before it
    const first = Math.floor(from / width) * width
    const before = this.reader.bucketBefore(series.id, width, first)
    const rows = this.reader.buckets(series.id, width, first, to)
    // more hours than points (years of hourly buckets): merge neighbours, so a chart gets about `points`
    const factor = Math.max(1, Math.ceil((to - first) / width / points))
    return {
      ...base, resolution, width: width * factor, points: BucketMerge.by(rows, width, factor).map(HistoryQuery.bucketPoint),
      ...(before ? { before: HistoryQuery.carried(before.start, before.last, null) } : {})
    }
  }

  // the raw tier keeps only its retention: a value older than that comes from the buckets
  private rawBefore(series: number, from: number) {
    const raw = this.reader.rawBefore(series, from)
    if (raw) return HistoryQuery.carried(raw.ts, raw.num, raw.text)
    const bucket = this.reader.bucketBefore(series, SeriesAggregator.FIVE_MINUTES, from) ?? this.reader.bucketBefore(series, SeriesAggregator.HOUR, from)
    return bucket ? HistoryQuery.carried(bucket.start, bucket.last, null) : undefined
  }

  private resolution(series: { id: number; valueType: string }, from: number, to: number, points: number): "raw" | "5m" | "1h" {
    const { rawDays, fineDays } = this.settings()
    const now = this.clock.now()
    if (series.valueType === "string") return "raw"
    // an hour of tolerance: a "last 7 days" request arrives a moment after the client's clock read,
    // and retention deletes in chunks anyway; the value before the range covers the edge
    const rawKept = rawDays === 0 || from >= now - rawDays * DAY - HistoryQuery.TOLERANCE_MS
    const limit = points * HistoryQuery.RAW_FACTOR
    if (rawKept && this.reader.countRaw(series.id, from, to, limit) <= limit) return "raw"
    const fineKept = fineDays === 0 || from >= now - fineDays * DAY
    return fineKept && (to - from) / SeriesAggregator.FIVE_MINUTES <= points ? "5m" : "1h"
  }

  private gaps(signalId: string, from: number, to: number): HistoryGapDto[] {
    const pauses = this.reader.pauses(signalId, from, to)
      .map(pause => ({ from: Math.max(from, pause.stopped), to: Math.min(to, pause.resumed ?? to) }))
    return HistoryQuery.merged([...this.downtime(from, to), ...pauses])
  }

  // overlapping or touching gaps become one, oldest first
  private static merged(gaps: HistoryGapDto[]): HistoryGapDto[] {
    const result: HistoryGapDto[] = []
    for (const gap of gaps.filter(g => g.to > g.from).sort((a, b) => a.from - b.from)) {
      const last = result.at(-1)
      if (last && gap.from <= last.to) last.to = Math.max(last.to, gap.to)
      else result.push({ ...gap })
    }
    return result
  }

  // what no run of Nexus covers after recording began; the time before the first run isn't
  // downtime, there just is no history yet
  private downtime(from: number, to: number): HistoryGapDto[] {
    const gaps: HistoryGapDto[] = []
    const runs = this.reader.runs(from, to)
    let covered = this.reader.ranBefore(from) ? from : Math.max(from, runs[0]?.started ?? to)
    for (const run of runs) {
      if (run.started - covered > HistoryQuery.SLACK_MS) gaps.push({ from: covered, to: run.started })
      covered = Math.max(covered, run.seen + HistoryQuery.SLACK_MS)
    }
    if (to - covered > HistoryQuery.SLACK_MS) gaps.push({ from: covered, to })
    return gaps
  }

  private static rawPoint(row: RawRow): RawPointDto {
    return {
      ts: row.ts, v: row.num, ...(row.text === null ? {} : { text: row.text }),
      ...(row.flags & HistoryFlags.forced ? { forced: true } : {}), ...(row.flags & HistoryFlags.command ? { command: true } : {})
    }
  }

  private static bucketPoint(row: BucketRow): BucketPointDto {
    return {
      ts: row.start, min: row.min, max: row.max, avg: row.wdur > 0 ? row.wsum / row.wdur : null, last: row.last, n: row.n,
      ...(row.flags & HistoryFlags.forced ? { forced: true } : {})
    }
  }

  private static carried(ts: number, v: number | null, text: string | null) {
    return { ts, v, ...(text === null ? {} : { text }) }
  }
}
