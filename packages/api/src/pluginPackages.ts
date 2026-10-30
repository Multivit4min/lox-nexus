import { z } from "zod"
import type { PluginStateDto } from "./plugins.ts"

/** Where an installed version came from. */
export type PluginSourceDto =
  /** `commit` is what `ref` pointed to at install time */
  | { kind: "git"; url: string; ref: string; commit: string }
  /** `archiveSha256` lets a user compare the upload with a published release */
  | { kind: "zip"; fileName: string; archiveSha256: string }
  /** a folder of the server's local plugin repository; `folder` is its absolute path on the server */
  | { kind: "local"; folder: string }

/** One installed version of a plugin. */
export interface PluginVersionDto {
  version: string
  source: PluginSourceDto
  bundleSha256: string
  /** epoch ms */
  installedAt: number
  installedBy: string
  /** false when its files are missing or changed on disk; `problem` says which */
  available: boolean
  problem?: string
}

/** GET /api/plugin-packages: a plugin installed through the installer. */
export interface InstalledPluginDto {
  id: string
  name: string
  icon?: string
  active: PluginVersionDto
  /** the version active before; the rollback target once updates and rollback exist (M5e-2) */
  previous?: PluginVersionDto
  /** stored instances of this plugin, running or not */
  instances: number
  /** their names (the label, or the id without one), e.g. to say which block an uninstall */
  instanceNames: string[]
  /** a development copy with the same id runs instead (NEXUS_DEV_PLUGINS_DIR) */
  shadowedByDevelopment: boolean
}

/** GET /api/plugin-packages/repository: a plugin in the server's local plugin repository. */
export interface RepositoryPluginDto {
  /** the folder's name; what POST stage/local takes */
  folder: string
  id?: string
  name?: string
  version?: string
  icon?: string
  /** why it can't be installed, e.g. not built yet; absent when it can */
  problem?: string
  /** the active installed version with the same id, if any */
  installedVersion?: string
}

/** A fetched and checked install that waits for confirmation. */
export interface StagedInstallDto {
  /** what confirm and discard take */
  stagingId: string
  /** epoch ms; the staged files are removed afterwards */
  expiresAt: number
  id: string
  name: string
  version: string
  icon?: string
  source: PluginSourceDto
  bundleSha256: string
  sensors: number
  actuators: number
  /** the plugin can receive the values of signals the user chooses (also of other systems) */
  watches?: boolean
  /** the worker's heap limit in MB, when the plugin asks for more than the default 128 */
  heapMb?: number
  /** the active installed version with the same id */
  installedVersion?: string
  /** the same version with the same bundle is installed already; confirming changes nothing */
  sameAsInstalled: boolean
  /** what confirming does to the existing instances; absent for a new plugin */
  impact?: UpdateImpactDto
}

/** A capability that a version switch removes or retypes, with how many signals use it. */
export interface CapabilityChangeDto {
  kind: "sensor" | "actuator"
  capability: string
  /** configured signals of this capability, across all instances */
  signals: number
  /** retyped only: the value type before and after */
  from?: string
  to?: string
}

/** What switching an installed plugin to another version does to its instances. */
export interface UpdateImpactDto {
  /** every instance of the plugin; the running ones restart */
  instances: InstalledInstanceDto[]
  /** capabilities the new version no longer offers: their signals become orphaned, wires stay */
  removed: CapabilityChangeDto[]
  /** capabilities whose value type changes: their wires are rebuilt, and values convert to the new type */
  retyped: CapabilityChangeDto[]
  /** capabilities that orphaned signals use and the new version offers again: those work again, wires included */
  restored: CapabilityChangeDto[]
  /** top-level settings the new version requires without a default; instances lacking them stop with an error */
  newRequiredConfig: string[]
}

/** An instance of the plugin and its state after an install. */
export interface InstalledInstanceDto {
  id: string
  label: string
  state: PluginStateDto
  lastError?: string
}

/** POST …/confirm: the installed plugin and its instances. */
export interface InstallOutcomeDto {
  plugin: InstalledPluginDto
  instances: InstalledInstanceDto[]
}

/** POST /api/plugin-packages/stage/git: an https URL and a branch or tag. */
export const GitInstallInputSchema = z.object({
  url: z.string().min(1).max(2048),
  ref: z.string().min(1).max(200)
})
export type GitInstallInput = z.infer<typeof GitInstallInputSchema>

/** POST /api/plugin-packages/stage/local: a folder name from GET …/repository. */
export const LocalInstallInputSchema = z.object({
  folder: z.string().min(1).max(255)
})
export type LocalInstallInput = z.infer<typeof LocalInstallInputSchema>

/** POST /api/plugin-packages/:id/activate: switch to the stored previous version (rollback) or back. */
export const ActivateInputSchema = z.object({
  version: z.string().min(1).max(64),
  /** the active version the user's review was based on */
  expectedActive: z.string().max(64)
})
export type ActivateInput = z.infer<typeof ActivateInputSchema>

/** POST …/stage/:stagingId/confirm: the active version the review was based on, null for a new plugin. */
export const ConfirmInstallInputSchema = z.object({
  expectedActive: z.string().max(64).nullable()
})
export type ConfirmInstallInput = z.infer<typeof ConfirmInstallInputSchema>

/**
 * GET /api/plugin-packages/:id/readme. `from` says whose README it is: the installed version's;
 * the development copy's; or, for a version installed without one (before Nexus kept READMEs), the
 * one now in the local repository folder it came from.
 */
export interface PluginReadmeDto {
  markdown: string
  from: "version" | "development" | "repository"
}

/** A plugin that has a newer version: in the local repository, or a new commit of its git ref. */
export interface PluginUpdateDto {
  id: string
  name: string
  installedVersion: string
  source: "local" | "git"
  /** local: the repository's version; git: the commit the ref points at now */
  available: string
}

/** GET /api/plugin-packages/updates */
export interface PluginUpdatesDto {
  updates: PluginUpdateDto[]
  /** git plugins whose last check failed, and why */
  problems: Array<{ id: string; name: string; problem: string }>
  /** epoch ms of the last git check; absent before the first (git is only checked when asked) */
  gitCheckedAt?: number
}

/** Body of POST /api/plugin-packages/batch: plugins installed from the local repository to update together. */
export const BatchUpdateInputSchema = z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(50) })
export type BatchUpdateInput = z.infer<typeof BatchUpdateInputSchema>

/** One plugin of a batch review: what it would change, or why it can't be updated. */
export interface BatchReviewItemDto {
  id: string
  name: string
  from: string
  to?: string
  impact?: UpdateImpactDto
  problem?: string
}

/** The review of a batch update, confirmed by its id while it hasn't expired. */
export interface BatchReviewDto {
  /** missing when no plugin can be updated: there is nothing to confirm */
  batchId?: string
  expiresAt: number
  items: BatchReviewItemDto[]
}

/** POST /api/plugin-packages/batch/:batchId/confirm: one outcome per plugin; one failing doesn't stop the others. */
export interface BatchOutcomeDto {
  items: Array<{ id: string; name: string; ok: boolean; version?: string; error?: string }>
}
