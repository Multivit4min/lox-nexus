import fs from "node:fs"
import path from "node:path"
import { RestoreService } from "./RestoreService.ts"

/**
 * Swaps a backup marked for restoring in, at start, under the database lock and before anything
 * opens the files: the current nexus.db, the plugins folder and (when the backup has one)
 * history.db move to <dataDir>/before-restore-<time>, the backup's files take their place. Each
 * step is done once even if a step fails and the next start runs it again: the folder is recorded
 * in the marker, and a file whose replacement already moved in is left alone. Without a backed-up
 * history the current one stays; history of signals the restored configuration lacks is removed
 * by retention later.
 */
export class RestoreApplier {
  /** @returns the folder the previous files went to, or undefined when nothing is to be restored */
  static apply(dataDir: string): string | undefined {
    const pending = path.join(dataDir, "restore-pending")
    const marker = path.join(pending, RestoreService.APPLY)
    if (!fs.existsSync(marker)) return undefined
    const state = JSON.parse(fs.readFileSync(marker, "utf8")) as { before?: string }
    const before = state.before ?? path.join(dataDir, `before-restore-${new Date().toISOString().replace(/[:.]/g, "-")}`)
    if (!state.before) fs.writeFileSync(marker, JSON.stringify({ ...state, before }), { mode: 0o600 })
    fs.mkdirSync(before, { recursive: true, mode: 0o700 })
    const files = path.join(pending, "files")
    for (const name of ["nexus.db", "history.db", "plugins"]) {
      const incoming = path.join(files, name)
      // moved in by an earlier run, or not in the backup (history)
      if (!fs.existsSync(incoming)) continue
      for (const suffix of name.endsWith(".db") ? ["", "-wal", "-shm"] : [""]) {
        const current = path.join(dataDir, name + suffix)
        if (fs.existsSync(current) && !fs.existsSync(path.join(before, name + suffix))) fs.renameSync(current, path.join(before, name + suffix))
        else if (fs.existsSync(current)) fs.rmSync(current, { recursive: true, force: true })
      }
      fs.renameSync(incoming, path.join(dataDir, name))
    }
    fs.rmSync(pending, { recursive: true, force: true })
    return before
  }
}
