/** Marks on a stored value. */
export const HistoryFlags = {
  /** a forced value, not what the device or Miniserver sent */
  forced: 1,
  /** arrived as a command, e.g. to an actuator */
  command: 2
} as const

/** One stored change of a signal (the raw tier). */
export interface HistorySample {
  signalId: string
  valueType: string
  /** epoch ms */
  ts: number
  /** the value as a number for charts; null for text and for "no value" */
  num: number | null
  /** text values, and the details of composite ones (colour, fade time) as JSON */
  text: string | null
  flags: number
}

/**
 * What one bucket of `width` ms got since it was last written. Buckets are time-weighted: avg is
 * wsum / wdur, so an on/off value's average is the share of time it was on. Parts of one bucket
 * merge: min/max combine, wsum, wdur and n add up, last is replaced.
 */
export interface BucketPart {
  width: number
  /** epoch ms, a multiple of width */
  start: number
  /** null when the bucket held no numeric value */
  min: number | null
  max: number | null
  /** value x ms */
  wsum: number
  /** ms with a value */
  wdur: number
  /** changes inside the bucket */
  n: number
  /** the value at the end of the part; null when it ended without one */
  last: number | null
  flags: number
}

/** A bucket part of one signal. */
export interface BucketDelta extends BucketPart {
  signalId: string
  valueType: string
}

/** A signal stopped being recorded (it left the selection) or started again; readers show the pause as a gap. */
export interface PauseChange {
  signalId: string
  at: number
  kind: "pause" | "resume"
}

/** Which data a prune or read is about: the raw changes, or the buckets of one width. */
export type HistoryTier = "raw" | number

/** Where history is kept. Synchronous, like the SQLite store behind it. */
export interface HistoryStore {
  /**
   * Stores everything in one transaction, and records that Nexus was running from `run.started`
   * until `run.seen`, so readers can tell "unchanged" from "Nexus was down".
   * @throws when the write failed; nothing of it was stored then
   */
  write(batch: { samples: readonly HistorySample[]; buckets: readonly BucketDelta[]; pauses?: readonly PauseChange[]; run: { started: number; seen: number } }): void
  /** the signals whose recording is paused (left the selection and not back yet) */
  pausedSignals(): string[]
  /** deletes up to `limit` rows of the tier older than `before`; @returns how many */
  prune(tier: HistoryTier, before: number, limit: number): number
  /** the signal ids that have history */
  seriesIds(): string[]
  /** deletes up to `limit` rows of a signal's history, and the signal itself and its pauses once none are left; @returns how many */
  purge(signalId: string, limit: number): number
}
