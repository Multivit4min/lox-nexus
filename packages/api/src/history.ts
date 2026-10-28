import { z } from "zod"

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
