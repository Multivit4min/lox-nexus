import fs from "node:fs"
import path from "node:path"
import { ConfigExportSchema } from "@lox-nexus/api"
import { z } from "zod"

const JournalSchema = z.object({
  backup: ConfigExportSchema,
  /** Miniserver passwords by id; an export leaves them out, so they are kept here for the restore */
  passwords: z.record(z.string(), z.string())
})

/** What a running import would have to put back: the configuration before it, with passwords. */
export interface ImportBackup {
  /** parsed, with defaults applied */
  backup: z.output<typeof ConfigExportSchema>
  passwords: Map<string, string>
}

/**
 * The configuration before a running config import, on disk. An import first writes it, then
 * replaces everything, then deletes it. A file left behind means Nexus stopped in the middle (a
 * crash, a power cut), and the next start restores it. It holds Miniserver passwords, like the
 * database, so it is private to the user and lives next to the database.
 */
export class ImportJournal {
  static readonly FILE_NAME = "import-in-progress.json"

  constructor(private readonly file: string) {}

  /** @param dataDir the data directory; the journal is `import-in-progress.json` in it */
  static in(dataDir: string) {
    return new ImportJournal(path.join(dataDir, ImportJournal.FILE_NAME))
  }

  /** writes it atomically (temp file, fsync, rename, fsync of the folder), so a crash leaves the old or the new one */
  write({ backup, passwords }: ImportBackup) {
    const temp = `${this.file}.tmp`
    // a leftover temp file would keep its mode; the new one is created 0600
    fs.rmSync(temp, { force: true })
    const fd = fs.openSync(temp, "w", 0o600)
    try {
      fs.writeSync(fd, JSON.stringify({ backup, passwords: Object.fromEntries(passwords) }))
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }
    fs.renameSync(temp, this.file)
    ImportJournal.syncFolder(path.dirname(this.file))
  }

  /**
   * The backup a stopped import left behind, if any.
   * @throws Error when the file is there but unreadable; it is left in place for a person to look at
   */
  read(): ImportBackup | undefined {
    let text: string
    try {
      text = fs.readFileSync(this.file, "utf8")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
      throw error
    }
    const { backup, passwords } = JournalSchema.parse(JSON.parse(text))
    return { backup, passwords: new Map(Object.entries(passwords)) }
  }

  /** removes it; never throws */
  clear() {
    try {
      fs.rmSync(this.file, { force: true })
      fs.rmSync(`${this.file}.tmp`, { force: true })
    } catch {
      // a journal left behind is restored at the next start, which is what it would hold anyway
    }
  }

  /**
   * Moves the journal aside as `import-failed-<time>.json`, so it is neither applied again at every
   * start (over later changes) nor overwritten by the next import. @returns where it went, if anywhere
   */
  setAside(): string | undefined {
    const target = path.join(path.dirname(this.file), `import-failed-${new Date().toISOString().replace(/[:.]/g, "-")}.json`)
    try {
      fs.renameSync(this.file, target)
      return target
    } catch {
      return undefined
    }
  }

  // makes a rename durable on power loss (a no-op where folders can't be opened, e.g. Windows)
  private static syncFolder(folder: string) {
    let fd: number | undefined
    try {
      fd = fs.openSync(folder, "r")
      fs.fsyncSync(fd)
    } catch {
      // best effort
    } finally {
      if (fd !== undefined) fs.closeSync(fd)
    }
  }
}
