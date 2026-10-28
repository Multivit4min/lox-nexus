import fs from "node:fs"
import { Database } from "../Database.ts"
import { Migrator } from "../Migrator.ts"
import { HISTORY_MIGRATIONS } from "./HistoryMigrations.ts"

/**
 * history.db, next to the main database but separate: it is the one store that grows, so it can
 * be left out of backups or deleted on its own. Written with synchronous = NORMAL: after a power
 * cut the last moments of history may be lost, which the configuration must never be.
 */
export class HistoryDatabase {
  readonly db: Database

  /** @param file a path, or ":memory:" for tests; migrated before use */
  constructor(file: string) {
    this.db = new Database(file)
    try {
      this.db.exec("PRAGMA synchronous = NORMAL")
      new Migrator(this.db, HISTORY_MIGRATIONS).migrate()
    } catch (error) {
      this.db.close()
      throw error
    }
  }

  /**
   * Opens the file; one that can't be opened or migrated (damaged, or written by a newer version)
   * is moved aside as `<file>.broken-<time>` and a new one started. History is expendable; it
   * must never keep Nexus from starting.
   */
  static open(file: string, warn: (message: string) => void): HistoryDatabase {
    try {
      return new HistoryDatabase(file)
    } catch (error) {
      if (file === ":memory:") throw error
      const aside = `${file}.broken-${Date.now()}`
      for (const suffix of ["", "-wal", "-shm"]) if (fs.existsSync(file + suffix)) fs.renameSync(file + suffix, aside + suffix)
      warn(`history.db can't be opened (${error instanceof Error ? error.message : String(error)}); moved it to ${aside} and started a new one`)
      return new HistoryDatabase(file)
    }
  }

  close() {
    this.db.close()
  }
}
