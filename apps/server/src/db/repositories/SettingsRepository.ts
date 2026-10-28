import type { Database } from "../Database.ts"

/** Settings as one JSON value per key. The owner of a key validates what comes back. */
export class SettingsRepository {
  constructor(private readonly db: Database) {}

  /** undefined when never set, or when the stored text isn't JSON */
  get(key: string): unknown {
    const row = this.db.get<{ value: string }>("SELECT value FROM settings WHERE key = :key", { key })
    if (!row) return undefined
    try {
      return JSON.parse(row.value) as unknown
    } catch {
      return undefined
    }
  }

  set(key: string, value: unknown) {
    this.db.run("INSERT INTO settings (key, value) VALUES (:key, :value) ON CONFLICT (key) DO UPDATE SET value = excluded.value", { key, value: JSON.stringify(value) })
  }
}
