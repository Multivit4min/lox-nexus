import fs from "node:fs"
import path from "node:path"

/** Bytes on disk of the databases (write-ahead logs included) and the installed plugins. */
export interface StorageFigures {
  databaseBytes: number
  historyBytes: number
  pluginsBytes: number
}

/** Measures what Nexus keeps on disk; anything missing (an in-memory database) counts as 0. */
export class StorageSizes {
  /** @param files undefined for an in-memory database */
  constructor(private readonly files: { database: string | undefined; history: string | undefined; pluginsDir: string }) {}

  measure(): StorageFigures {
    return {
      databaseBytes: StorageSizes.database(this.files.database),
      historyBytes: StorageSizes.database(this.files.history),
      pluginsBytes: StorageSizes.folder(this.files.pluginsDir)
    }
  }

  private static database(file: string | undefined) {
    if (!file) return 0
    return [file, `${file}-wal`, `${file}-shm`].reduce((sum, part) => sum + StorageSizes.size(part), 0)
  }

  private static folder(dir: string): number {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return 0
    }
    return entries.reduce((sum, entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return sum + StorageSizes.folder(full)
      return entry.isFile() ? sum + StorageSizes.size(full) : sum
    }, 0)
  }

  private static size(file: string) {
    try {
      return fs.statSync(file).size
    } catch {
      return 0
    }
  }
}
