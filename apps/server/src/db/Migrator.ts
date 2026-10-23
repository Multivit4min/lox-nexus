import type { Database } from "./Database.ts"

/** One schema step. Versions are applied in ascending order and never edited once released. */
export interface Migration {
  version: number
  name: string
  sql: string
}

/** Applies pending migrations, each in its own transaction, tracked by SQLite's user_version. */
export class Migrator {
  constructor(private readonly db: Database, private readonly migrations: readonly Migration[]) {}

  /** @returns the names of the migrations that were applied */
  migrate(): string[] {
    const current = this.db.get<{ user_version: number }>("PRAGMA user_version")?.user_version ?? 0
    const pending = [...this.migrations].filter(m => m.version > current).sort((a, b) => a.version - b.version)
    for (const migration of pending) {
      this.db.transaction(() => {
        this.db.exec(migration.sql)
        // PRAGMA takes no parameters; the version is a number from our own list
        this.db.exec(`PRAGMA user_version = ${Math.trunc(migration.version)}`)
      })
    }
    return pending.map(m => `${m.version}_${m.name}`)
  }
}
