import fs from "node:fs"

/**
 * Keeps a second server off the same database file: two processes writing one SQLite file each
 * believe they own its state (forces, snapshot, plugin store), and their writes interleave.
 *
 * The lock is `<database>.lock` holding the owner's process id. A lock whose process is gone (a
 * crash, a power cut) is taken over. One naming this process's own pid is stale too: in a
 * container the server is often pid 1 after every restart. Tools that run next to a server on
 * purpose (reset-password) don't take the lock.
 */
export class DatabaseLock {
  private constructor(private readonly file: string) {}

  /** @throws Error naming the other process when one holds the lock */
  static acquire(databaseFile: string) {
    const file = `${databaseFile}.lock`
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        fs.writeFileSync(file, String(process.pid), { flag: "wx", mode: 0o600 })
        return new DatabaseLock(file)
      } catch (error) {
        if ((error as { code?: unknown }).code !== "EEXIST") throw error
      }
      const owner = Number.parseInt(fs.readFileSync(file, "utf8"), 10)
      if (DatabaseLock.alive(owner)) {
        throw new Error(`another Nexus (process ${owner}) uses ${databaseFile}; stop it first, or point NEXUS_DATA_DIR elsewhere`)
      }
      // stale: remove and try once more (another starter may win the race, then we fail above)
      fs.rmSync(file, { force: true })
    }
    throw new Error(`could not lock ${databaseFile}`)
  }

  /** removes the lock if it is still ours */
  release() {
    try {
      if (fs.readFileSync(this.file, "utf8") === String(process.pid)) fs.rmSync(this.file)
    } catch {
      // gone already
    }
  }

  private static alive(pid: number) {
    if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return false
    try {
      process.kill(pid, 0)
      return true
    } catch (error) {
      // EPERM: the process exists but belongs to someone else
      return (error as { code?: unknown }).code === "EPERM"
    }
  }
}
