import { HistorySettingsSchema, type HistorySettings, type HistorySettingsInput } from "@lox-nexus/api"
import { EventEmitter } from "node:events"
import type { SettingsRepository } from "../db/repositories/SettingsRepository.ts"

/**
 * The history settings, read once and kept; the recorder and retention read `current` every
 * time, so an update applies at once. Stored settings that no longer fit the schema (written by
 * a newer version) fall back to the defaults instead of stopping the history. Emits `changed`
 * after an update.
 */
export class HistorySettingsStore extends EventEmitter<{ changed: [] }> {
  static readonly KEY = "history"
  private settings: HistorySettings

  constructor(private readonly repo: SettingsRepository, warn: (message: string) => void) {
    super()
    const stored = HistorySettingsSchema.safeParse(repo.get(HistorySettingsStore.KEY) ?? {})
    if (!stored.success) warn("the stored history settings can't be read; using the defaults")
    this.settings = stored.success ? stored.data : HistorySettingsSchema.parse({})
  }

  get current(): HistorySettings {
    return this.settings
  }

  /** fields left out (or undefined) keep their current value; @throws ZodError for invalid settings */
  update(input: Partial<HistorySettingsInput> | Record<string, unknown>): HistorySettings {
    const given = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))
    const parsed = HistorySettingsSchema.parse({ ...this.settings, ...given })
    this.repo.set(HistorySettingsStore.KEY, parsed)
    this.settings = parsed
    this.emit("changed")
    return parsed
  }
}
