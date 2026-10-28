import { z } from "zod"

/** What a backup holds, as its first entry (manifest.json). */
export const BackupManifestSchema = z.object({
  format: z.literal(1),
  createdAt: z.string(),
  /** the Nexus version that made it */
  version: z.string(),
  /** nexus.db's schema version; a newer one than this Nexus knows can't be restored */
  schemaVersion: z.int().nonnegative(),
  /** whether history.db is in it */
  history: z.boolean(),
  /** installed plugins, as "<id>/<version>" */
  plugins: z.array(z.string())
})
export type BackupManifest = z.infer<typeof BackupManifestSchema>

/** The paths a backup may contain; anything else in a file is refused. */
export class BackupPaths {
  static allowed(relative: string) {
    return ["manifest.json", "nexus.db", "history.db"].includes(relative) || relative.startsWith("plugins/")
  }
}
