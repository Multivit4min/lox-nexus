import { z } from "zod"
import type { SignalDisplayDto } from "./signalDisplay.ts"

/** GET/PUT /api/history/settings. Retention in days per tier; 0 keeps forever. */
export const HistorySettingsSchema = z.object({
  /** records at all; the selection decides which signals */
  enabled: z.boolean().default(true),
  /** every change */
  rawDays: z.int().min(0).max(3650).default(7),
  /** 5-minute buckets */
  fineDays: z.int().min(0).max(3650).default(90),
  /** 1-hour buckets */
  coarseDays: z.int().min(0).max(36500).default(730),
  /** changes of one signal closer together than this keep only the latest as a raw value; buckets see all */
  rawMinIntervalMs: z.int().min(0).max(3_600_000).default(1000)
})
export type HistorySettings = z.infer<typeof HistorySettingsSchema>
export type HistorySettingsInput = z.input<typeof HistorySettingsSchema>

/** GET /api/history/signals/:signalId: the range in epoch ms, and about how many points the chart can show */
export const HistoryQuerySchema = z.object({
  from: z.coerce.number().int().min(0),
  to: z.coerce.number().int().min(0),
  points: z.coerce.number().int().min(10).max(5000).default(800)
}).refine(query => query.to > query.from, { message: "to must be after from", path: ["to"] })
export type HistoryQuery = z.input<typeof HistoryQuerySchema>

/** One stored change. `v` is the value as a number (null for text and "no value"); `text` holds text values and the details of light values. */
export interface RawPointDto {
  ts: number
  v: number | null
  text?: string
  forced?: true
  command?: true
}

/** One bucket: the value's range and time-weighted average in it, and how often it changed. */
export interface BucketPointDto {
  /** the bucket's start */
  ts: number
  min: number | null
  max: number | null
  avg: number | null
  last: number | null
  /** changes inside the bucket */
  n: number
  forced?: true
}

/** A time Nexus wasn't running (or recording): nothing is known about the value then. */
export interface HistoryGapDto {
  from: number
  to: number
}

interface HistorySeriesBase extends SignalDisplayDto {
  signalId: string
  valueType: string
  from: number
  to: number
  /** the value before `from`, so a line can start at the left edge; absent when there is none */
  before?: { ts: number; v: number | null; text?: string }
  gaps: HistoryGapDto[]
}

/**
 * A signal's history over a range, at the finest resolution that fits the requested points and
 * is still kept: every change (raw), or 5-minute or 1-hour buckets. Buckets are only stored
 * where the value changed; a bucket that is missing (outside a gap) kept the previous `last`.
 */
export type HistorySeriesDto =
  | (HistorySeriesBase & { resolution: "raw"; points: RawPointDto[]; /** more changes than could be sent; the newest are missing */ truncated?: true })
  | (HistorySeriesBase & {
    resolution: "5m" | "1h"
    /** ms each point covers: 5 minutes, an hour, or several hours merged when a long range has more hours than points */
    width: number
    points: BucketPointDto[]
  })

/** GET /api/history/stats: what the history takes, and where it is heading at the current rate. */
export interface HistoryStatsDto {
  /** recording is switched on in the settings */
  enabled: boolean
  fileBytes: number
  /** signals with stored history */
  series: number
  /** signals the selection takes right now (whether or not recording is on) */
  recorded: number
  /** rows written in the last hour, per tier: the rate the estimate is based on */
  lastHour: { raw: number; fine: number; coarse: number }
  /** about how large the file gets once every tier holds its full retention at the last hour's rate; null while nothing was written */
  projectedBytes: number | null
  /** values dropped because writing failed, since the start */
  dropped: number
}
