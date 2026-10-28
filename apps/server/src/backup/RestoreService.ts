import fs from "node:fs/promises"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import type { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { createGunzip } from "node:zlib"
import { z } from "zod"
import { MIGRATIONS } from "../db/migrations.ts"
import { HttpError } from "../http/HttpError.ts"
import { BackupArchive } from "./BackupArchive.ts"
import { BackupCipher, NotABackupError, WrongPassphraseError } from "./BackupCipher.ts"
import { BackupManifestSchema, BackupPaths } from "./BackupManifest.ts"
import { BackupService } from "./BackupService.ts"

const PendingSchema = z.object({ manifest: BackupManifestSchema, stagedAt: z.number() })
/** A verified backup, waiting to be restored. */
export type PendingRestore = z.infer<typeof PendingSchema>

/**
 * Prepares a restore: the uploaded file is decrypted and unpacked into <dataDir>/restore-pending,
 * and only once the whole file checked out (the tag at its end) is it marked checked. Restoring it
 * is a second, explicit step (markForApply); only then does the next start swap it in
 * (RestoreApplier). Until then the running installation is untouched, also across restarts.
 */
export class RestoreService {
  static readonly CHECKED = "checked.json"
  static readonly APPLY = "apply.json"
  /** room left on the disk for the database to grow while the restore waits */
  private static readonly RESERVE = 256 * 1024 * 1024
  private uploading = false

  constructor(private readonly dataDir: string) {}

  get dir() {
    return path.join(this.dataDir, "restore-pending")
  }

  /** an upload is being checked right now */
  get busy() {
    return this.uploading
  }

  /** @throws HttpError 400 for a wrong passphrase, a file that isn't a backup or one from a newer Nexus; 409 while another upload runs */
  async stage(source: Readable, passphrase: string): Promise<PendingRestore> {
    if (passphrase.length < BackupService.MIN_PASSPHRASE) throw HttpError.badRequest("the passphrase is too short")
    if (this.uploading) throw HttpError.conflict("a backup is being uploaded already")
    this.uploading = true
    try {
      await fs.rm(this.dir, { recursive: true, force: true })
      const files = path.join(this.dir, "files")
      // a backup without installed plugins restores an empty plugins folder
      await fs.mkdir(path.join(files, "plugins"), { recursive: true, mode: 0o700 })
      const room = await fs.statfs(this.dataDir).then(stats => stats.bavail * stats.bsize - RestoreService.RESERVE)
      await pipeline(source, BackupCipher.decrypt(passphrase), createGunzip(), async (decrypted: AsyncIterable<Buffer>) => {
        await BackupArchive.extract(decrypted, files, BackupPaths.allowed, room)
      })
      const pending = { manifest: await this.check(files), stagedAt: Date.now() }
      await fs.writeFile(path.join(this.dir, RestoreService.CHECKED), JSON.stringify(pending), { mode: 0o600 })
      return pending
    } catch (error) {
      await fs.rm(this.dir, { recursive: true, force: true })
      throw RestoreService.refusal(error)
    } finally {
      this.uploading = false
    }
  }

  /** the checked backup, if any, and whether it is marked to be restored at the next start */
  async pending(): Promise<(PendingRestore & { applying: boolean }) | undefined> {
    for (const [name, applying] of [[RestoreService.APPLY, true], [RestoreService.CHECKED, false]] as const) {
      const text = await fs.readFile(path.join(this.dir, name), "utf8").catch(() => undefined)
      const parsed = text === undefined ? undefined : PendingSchema.safeParse(JSON.parse(text))
      if (parsed?.success) return { ...parsed.data, applying }
    }
    return undefined
  }

  /** marks the checked backup to be restored at the next start; @throws HttpError 404 without one, 409 during an upload */
  async markForApply() {
    if (this.uploading) throw HttpError.conflict("a backup is being uploaded")
    await fs.rename(path.join(this.dir, RestoreService.CHECKED), path.join(this.dir, RestoreService.APPLY)).catch(async () => {
      if (!(await this.pending())?.applying) throw HttpError.notFound("checked backup")
    })
  }

  /** @throws HttpError 409 during an upload */
  async discard() {
    if (this.uploading) throw HttpError.conflict("a backup is being uploaded")
    await fs.rm(this.dir, { recursive: true, force: true })
  }

  // the manifest must describe what came, and the database must be one this version can migrate
  private async check(files: string) {
    const manifest = BackupManifestSchema.parse(JSON.parse(await fs.readFile(path.join(files, "manifest.json"), "utf8")))
    const has = async (name: string) => fs.access(path.join(files, name)).then(() => true, () => false)
    if (!(await has("nexus.db")) || (await has("history.db")) !== manifest.history) throw new Error("damaged backup: files are missing")
    const db = new DatabaseSync(path.join(files, "nexus.db"), { readOnly: true })
    try {
      const { user_version: schema } = db.prepare("PRAGMA user_version").get() as { user_version: number }
      const known = Math.max(...MIGRATIONS.map(m => m.version))
      if (schema > known) throw HttpError.badRequest(`the backup was made by a newer Nexus (database version ${schema}); update Nexus first`)
    } finally {
      db.close()
    }
    return manifest
  }

  private static refusal(error: unknown) {
    if (error instanceof HttpError) return error
    if (error instanceof WrongPassphraseError || error instanceof NotABackupError) return HttpError.badRequest(error.message)
    if (error instanceof SyntaxError || error instanceof z.ZodError) return HttpError.badRequest("damaged backup: its manifest can't be read")
    if (!(error instanceof Error)) return error
    if (error.message.startsWith("damaged backup") || error.message.startsWith("the backup doesn't fit")) return HttpError.badRequest(error.message)
    // gunzip fails early on bytes decrypted with a wrong key
    if ("code" in error && String(error.code).startsWith("Z_")) return HttpError.badRequest(new WrongPassphraseError().message)
    return error
  }
}
