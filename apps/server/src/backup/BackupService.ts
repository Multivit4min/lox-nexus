import fsSync from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { pipeline, Readable } from "node:stream"
import { createGzip } from "node:zlib"
import type { Logger } from "pino"
import type { Database } from "../db/Database.ts"
import { HttpError } from "../http/HttpError.ts"
import { BackupArchive, type ArchiveEntry } from "./BackupArchive.ts"
import { BackupCipher } from "./BackupCipher.ts"
import type { BackupManifest } from "./BackupManifest.ts"

/** What making a backup reads. */
export interface BackupSources {
  dataDir: string
  database: Pick<Database, "copyTo" | "get">
  /** history.db, when there is one */
  history?: Pick<Database, "copyTo">
  /** installed plugins: <pluginsDir>/<id>/<version>/… */
  pluginsDir: string
  version: string
  log: Pick<Logger, "warn">
}

/**
 * Makes the encrypted backup file: consistent copies of the databases (SQLite's online backup, so
 * Nexus keeps running), the installed plugins' files and a manifest, gzipped and encrypted as one
 * stream. Copies go to a temporary folder in the data directory, removed when the stream ends.
 */
export class BackupService {
  static readonly MIN_PASSPHRASE = 8
  static readonly TEMP_PREFIX = ".backup-"
  private busy = false

  constructor(private readonly sources: BackupSources) {}

  /** @throws HttpError 400 for a short passphrase, 409 while another backup is being made */
  async create(passphrase: string, withHistory: boolean): Promise<{ stream: Readable; filename: string }> {
    if (passphrase.length < BackupService.MIN_PASSPHRASE) throw HttpError.badRequest(`the passphrase needs at least ${BackupService.MIN_PASSPHRASE} characters`)
    if (this.busy) throw HttpError.conflict("a backup is being made already")
    this.busy = true
    let temp: string | undefined
    const cleanup = () => {
      this.busy = false
      if (temp) void fs.rm(temp, { recursive: true, force: true }).catch(error => this.sources.log.warn({ err: error, temp }, "removing a backup's temporary copies failed"))
    }
    try {
      temp = await fs.mkdtemp(path.join(this.sources.dataDir, BackupService.TEMP_PREFIX))
      const entries = await this.collect(temp, withHistory && this.sources.history !== undefined)
      const cipher = await BackupCipher.encrypt(passphrase)
      const stream = pipeline(Readable.from(BackupArchive.write(entries)), createGzip(), cipher, error => {
        if (error) this.sources.log.warn({ err: error }, "making a backup failed")
        cleanup()
      })
      return { stream, filename: `lox-nexus-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.nxbackup` }
    } catch (error) {
      cleanup()
      throw error
    }
  }

  private async collect(temp: string, withHistory: boolean): Promise<ArchiveEntry[]> {
    const { database, history, pluginsDir, version } = this.sources
    await database.copyTo(path.join(temp, "nexus.db"))
    if (withHistory) await history!.copyTo(path.join(temp, "history.db"))
    const plugins = await BackupService.snapshotPlugins(pluginsDir, path.join(temp, "plugins"))
    const manifest: BackupManifest = {
      format: 1, createdAt: new Date().toISOString(), version, history: withHistory,
      schemaVersion: database.get<{ user_version: number }>("PRAGMA user_version")?.user_version ?? 0,
      plugins: [...new Set(plugins.map(file => file.split("/").slice(0, 2).join("/")))]
    }
    await fs.writeFile(path.join(temp, "manifest.json"), JSON.stringify(manifest), { mode: 0o600 })
    return [
      { path: "manifest.json", file: path.join(temp, "manifest.json") },
      { path: "nexus.db", file: path.join(temp, "nexus.db") },
      ...(withHistory ? [{ path: "history.db", file: path.join(temp, "history.db") }] : []),
      ...plugins.map(file => ({ path: `plugins/${file}`, file: path.join(temp, "plugins", ...file.split("/")) }))
    ]
  }

  /**
   * Leftovers of a backup that was cut off by a crash; called at start, before anything runs.
   */
  static sweep(dataDir: string) {
    for (const name of fsSync.readdirSync(dataDir, { withFileTypes: true }).filter(entry => entry.isDirectory() && entry.name.startsWith(BackupService.TEMP_PREFIX))) {
      fsSync.rmSync(path.join(dataDir, name.name), { recursive: true, force: true })
    }
  }

  // Hard links (copies where linking isn't possible): an uninstall or update while a slow download
  // runs then can't cut the backup short. Installed versions only: staging and other dot folders
  // are work in progress. A missing folder is no plugins; any other error fails the backup.
  private static async snapshotPlugins(dir: string, into: string): Promise<string[]> {
    const found = await fs.readdir(dir, { recursive: true, withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return []
      throw error
    })
    const files = found
      .filter(entry => entry.isFile())
      .map(entry => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
      .filter(file => !file.startsWith("."))
    for (const file of files) {
      const [from, to] = [path.join(dir, ...file.split("/")), path.join(into, ...file.split("/"))]
      await fs.mkdir(path.dirname(to), { recursive: true })
      await fs.link(from, to).catch(() => fs.copyFile(from, to))
    }
    return files
  }
}
