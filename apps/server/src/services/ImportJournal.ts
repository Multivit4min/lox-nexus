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
  constructor(private readonly file: string) {}

  /** @param dataDir the data directory; the journal is `import-in-progress.json` in it */
  static in(dataDir: string) {
    return new ImportJournal(path.join(dataDir, "import-in-progress.json"))
  }

  /** writes it atomically (temp file, fsync, rename), so a crash leaves the old or the new one */
  write({ backup, passwords }: ImportBackup) {
    const temp = `${this.file}.tmp`
    const fd = fs.openSync(temp, "w", 0o600)
    try {
      fs.writeSync(fd, JSON.stringify({ backup, passwords: Object.fromEntries(passwords) }))
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }
    fs.renameSync(temp, this.file)
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

  clear() {
    fs.rmSync(this.file, { force: true })
    fs.rmSync(`${this.file}.tmp`, { force: true })
  }
}
