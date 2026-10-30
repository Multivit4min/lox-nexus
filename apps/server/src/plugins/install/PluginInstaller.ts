import path from "node:path"
import type { Logger } from "pino"
import type { PluginPackageRepository, StoredVersion } from "../../db/repositories/PluginPackageRepository.ts"
import { InstallError } from "./InstallError.ts"
import type { PackageInspector, StagedPackage } from "./PackageInspector.ts"
import type { PendingInstall, PendingInstalls } from "./PendingInstalls.ts"
import { PluginDirectory } from "./PluginDirectory.ts"
import type { PluginSource } from "./PluginSource.ts"
import type { PluginVersions } from "./PluginVersions.ts"
import type { StagingArea } from "./StagingArea.ts"

/** A staged install and how it compares to what is installed. */
export interface StageResult {
  pending: PendingInstall
  installedVersion?: string
  sameAsInstalled: boolean
}

/** What the installer works with; all built by PluginAssembly. */
export interface InstallerDeps {
  staging: StagingArea
  pending: PendingInstalls
  inspector: PackageInspector
  versions: PluginVersions
  repo: PluginPackageRepository
  log: Logger
}

/**
 * The two phases of an install. stage() fetches into a staging folder, checks and describes the
 * plugin, and parks it for review; confirm() moves it into place and records it. Callers hold
 * the OperationLock around both.
 */
export class PluginInstaller {
  constructor(private readonly deps: InstallerDeps) {}

  /**
   * Fetches, checks and describes the plugin (which runs its code once) and parks it for review,
   * replacing any earlier pending install.
   * @throws InstallError exists for a stored version with another bundle, plus whatever the source throws; the staging folder is gone afterwards
   */
  async stage(source: PluginSource, by: string): Promise<StageResult> {
    const { staging, pending, log } = this.deps
    await pending.discard()
    const { stagingDir, staged, comparison } = await this.fetch(source, by)
    try {
      const parked = await pending.put(stagingDir, staged, by)
      log.info({ by, source: staged.origin, plugin: staged.manifest.id, version: staged.manifest.version, bundleSha256: staged.bundleSha256 }, "plugin staged")
      return { pending: parked, ...comparison }
    } catch (error) {
      await staging.remove(stagingDir)
      throw InstallError.fromFileSystem(error)
    }
  }

  /**
   * Fetches, checks and describes the plugin like stage(), but parks nothing: an install someone
   * else is reviewing stays. For telling what an update would change.
   * @throws like stage()
   */
  async check(source: PluginSource, by: string): Promise<Omit<StageResult, "pending"> & { staged: StagedPackage }> {
    const { stagingDir, staged, comparison } = await this.fetch(source, by)
    await this.deps.staging.remove(stagingDir)
    return { staged, ...comparison }
  }

  /**
   * Installs a staged plugin after re-checking that nothing changed since the review: a new
   * version is moved into place and becomes active, the stored previous version (same bundle) is
   * activated again, and an identical re-install of the active version changes nothing.
   * @param expectedActive the active version the user's review was based on, null for a new plugin
   * @returns the active version afterwards and whether it changed
   * @throws InstallError not-found (expired), conflict (changed meanwhile), exists, no-space
   */
  async confirm(stagingId: string, expectedActive: string | null, by: string): Promise<{ stored: StoredVersion; changed: boolean }> {
    const { pending, staging, versions, repo, log } = this.deps
    const install = pending.get(stagingId)
    if (!install) throw new InstallError("not-found", "the checked install expired or was discarded; check it again")
    const { staged } = install
    if ((repo.get(staged.manifest.id)?.active.version ?? null) !== expectedActive) {
      await pending.discard(stagingId)
      throw new InstallError("conflict", `${staged.manifest.name} changed since it was checked; check it again`)
    }
    pending.take(stagingId)
    try {
      const entry = PluginDirectory.inside(staged.packageDir, staged.manifest.entry)
      if (await PluginDirectory.sha256(entry) !== staged.bundleSha256) throw new InstallError("conflict", "the staged bundle changed; check it again")
      const { id, version } = staged.manifest
      const kept = repo.version(id, version)
      // installing a stored version again is also how its broken files get repaired: same bundle, known good
      const repaired = kept !== undefined && !await versions.load(kept)
      if (repaired) await versions.repair(staged)
      if (this.compare(staged).sameAsInstalled) return { stored: kept!, changed: repaired }
      if (kept) versions.activate(id, version)
      const stored = kept ?? await versions.commit(staged, by)
      log.info({ by, source: staged.origin, plugin: stored.pluginId, version: stored.version, bundleSha256: stored.bundleSha256 }, "plugin installed")
      return { stored, changed: true }
    } catch (error) {
      throw InstallError.fromFileSystem(error)
    } finally {
      await staging.remove(install.stagingDir)
    }
  }

  // the staging folder is removed when anything fails, so only a successful fetch leaves one to the caller
  private async fetch(source: PluginSource, by: string) {
    const { staging, inspector, log } = this.deps
    const stagingDir = await staging.create()
    try {
      const packageDir = path.join(stagingDir, "package")
      const staged = await inspector.inspect(packageDir, await source.fetch(packageDir))
      return { stagingDir, staged, comparison: this.compare(staged) }
    } catch (error) {
      await staging.remove(stagingDir)
      if (error instanceof InstallError) log.warn({ by, reason: error.reason, problem: error.message }, "plugin install refused")
      throw InstallError.fromFileSystem(error)
    }
  }

  /** the staged package waiting under `stagingId`, if any */
  staged(stagingId: string) {
    return this.deps.pending.get(stagingId)?.staged
  }

  /** drops a staged install the user cancelled; false when it is gone already */
  discard(stagingId: string) {
    return this.deps.pending.discard(stagingId)
  }

  // a version number names one bundle forever, so a stored version can only come back unchanged
  private compare(staged: StagedPackage): Omit<StageResult, "pending"> {
    const { id, name, version } = staged.manifest
    const active = this.deps.repo.get(id)?.active
    const stored = this.deps.repo.version(id, version)
    if (stored && stored.bundleSha256 !== staged.bundleSha256) {
      throw new InstallError("exists", `${name} ${version} is installed with a different bundle; raise the version to install this one`)
    }
    return { ...(active ? { installedVersion: active.version } : {}), sameAsInstalled: active?.version === version }
  }
}
