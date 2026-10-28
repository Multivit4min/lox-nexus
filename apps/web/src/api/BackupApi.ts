import type { RestoreApplyDto, RestoreStatusDto } from "@lox-nexus/api"
import type { Http } from "./Http.ts"

/** /api/backup: restoring a backup (making one is a plain form post, so the browser saves it as it arrives) */
export class BackupApi {
  /** where the backup form posts to */
  static readonly CREATE_URL = "/api/backup"

  constructor(private readonly http: Http) {}

  status() {
    return this.http.get<RestoreStatusDto>("/api/backup/restore")
  }

  /** uploads and checks a backup; nothing changes until apply() */
  stage(file: Blob, passphrase: string) {
    return this.http.upload<NonNullable<RestoreStatusDto["pending"]>>("/api/backup/restore", file, { "x-backup-passphrase": encodeURIComponent(passphrase) })
  }

  discard() {
    return this.http.delete("/api/backup/restore")
  }

  /** marks the checked backup for the next start; Nexus restarts now if it can (`restarting`) */
  apply() {
    return this.http.post<RestoreApplyDto>("/api/backup/restore/apply")
  }
}
