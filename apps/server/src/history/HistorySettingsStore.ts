import { HistorySettingsSchema, type HistorySettings, type HistorySettingsInput } from "@lox-nexus/api"
import type { SettingsRepository } from "../db/repositories/SettingsRepository.ts"

/**
 * The history settings, read once and kept; the recorder and retention read `current` every
 * time, so an update applies at once. Stored settings that no longer fit the schema (written by
 * a newer version) fall back to the defaults instead of stopping the history.
 */
export class HistorySettingsStore {
  static readonly KEY = "history"
  private settings: HistorySettings

  constructor(private readonly repo: SettingsRepository, warn: (message: string) => void) {
    const stored = HistorySettingsSchema.safeParse(repo.get(HistorySettingsStore.KEY) ?? {})
    if (!stored.success) warn("the stored history settings can't be read; using the defaults")
    this.settings = stored.success ? stored.data : HistorySettingsSchema.parse({})
  }

  get current(): HistorySettings {
    return this.settings
  }

  /** fields left out keep their current value; @throws ZodError for invalid settings */
  update(input: HistorySettingsInput): HistorySettings {
    const parsed = HistorySettingsSchema.parse({ ...this.settings, ...input })
    this.repo.set(HistorySettingsStore.KEY, parsed)
    this.settings = parsed
    return parsed
  }
}
