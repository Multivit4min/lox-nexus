import { z } from "zod"

/** One version's section of Nexus's changelog: its markdown without the heading. */
export interface AppChangeDto {
  version: string
  /** YYYY-MM-DD, as the changelog gives it */
  date?: string
  markdown: string
}

/** GET /api/system/update: whether a newer Nexus is out, and what changed since this one. */
export interface AppUpdateDto {
  /** the running version */
  current: string
  /** checks once a day by itself; off: only when asked */
  enabled: boolean
  /** NEXUS_UPDATE_CHECK=false: Nexus never asks GitHub, not even when asked */
  disabledByServer: boolean
  /** epoch ms of the last check, whether it worked or failed */
  checkedAt?: number
  /** epoch ms of the last check that GitHub answered; "the newest version" only stands on that */
  answeredAt?: number
  /** the newest release, only while it is newer than the running version (and checks are allowed) */
  available?: {
    version: string
    /** the release's page on GitHub */
    url: string
    /** the repository's files at that release, which the changelog's relative links point into */
    filesUrl: string
    publishedAt?: number
  }
  /** changelog sections newer than the running version, newest first */
  changes: AppChangeDto[]
  /** why the last check failed; the result before it stays */
  error?: string
}

/** PUT /api/system/update/settings */
export const AppUpdateSettingsSchema = z.object({ enabled: z.boolean() })
export type AppUpdateSettings = z.infer<typeof AppUpdateSettingsSchema>
