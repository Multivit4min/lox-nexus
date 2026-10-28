/** What a backup holds, from its manifest. */
export interface BackupManifestDto {
  createdAt: string
  /** the Nexus version that made it */
  version: string
  history: boolean
  /** installed plugins, "<id>/<version>" */
  plugins: string[]
}

/** GET /api/backup/restore: a checked backup (marked `applying` once it is to be restored at the next start), and whether Nexus can restart itself. */
export interface RestoreStatusDto {
  pending: { manifest: BackupManifestDto; stagedAt: number; applying: boolean } | null
  canRestart: boolean
}

/** POST /api/backup/restore/apply: whether Nexus restarts now, or must be restarted by hand to restore it */
export interface RestoreApplyDto {
  restarting: boolean
}
