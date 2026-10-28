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
  /** the active installed version with the same id */
  installedVersion?: string
  /** the same version with the same bundle is installed already; confirming changes nothing */
  sameAsInstalled: boolean
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

/** POST …/stage/:stagingId/confirm: the active version the review was based on, null for a new plugin. */
export const ConfirmInstallInputSchema = z.object({
  expectedActive: z.string().max(64).nullable()
})
export type ConfirmInstallInput = z.infer<typeof ConfirmInstallInputSchema>
