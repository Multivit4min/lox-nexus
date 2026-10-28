import type { PackageDescriber } from "@lox-nexus/core"
import { PluginDescriptionSchema } from "@lox-nexus/plugin-sdk/wire"
import type { Logger } from "pino"
import type { PluginPackageRepository, StoredVersion } from "../../db/repositories/PluginPackageRepository.ts"
import type { CatalogEntry } from "../PluginCatalog.ts"
import type { StagedPackage } from "./PackageInspector.ts"
import { PluginDirectory } from "./PluginDirectory.ts"

/**
 * Installed versions: commits staged packages (folder first, then the rows) and turns stored
 * versions back into runnable packages after checking their bundle. A version whose files are
 * missing or changed is unavailable, with the reason in `problem()`.
 */
export class PluginVersions {
  /** why a version is unavailable, by "<id>@<version>" */
  private readonly problemsByVersion = new Map<string, string>()

  constructor(
    private readonly directory: PluginDirectory,
    private readonly repo: PluginPackageRepository,
    private readonly describer: Pick<PackageDescriber, "describe">,
    private readonly log: Logger
  ) {}

  /** undefined when the version is available (or was never loaded) */
  problem(id: string, version: string) {
    return this.problemsByVersion.get(`${id}@${version}`)
  }

  /**
   * Moves the staged package into place and records it as the active version. If the rows can't
   * be written, the folder is removed again, so nothing half-installed stays.
   */
  async commit(staged: StagedPackage, by: string): Promise<StoredVersion> {
    const { id, name, version, entry, icon } = staged.manifest
    // a folder without a row is left over from a failed uninstall or commit; boot would delete it too
    if (!this.repo.versions().some(row => row.pluginId === id && row.version === version)) await this.directory.removeVersion(id, version)
    await this.directory.moveIn(staged.packageDir, id, version)
    const stored: StoredVersion = {
      pluginId: id, version, name, ...(icon ? { icon } : {}), entry, source: staged.origin, bundleSha256: staged.bundleSha256,
      description: JSON.stringify(staged.description), installedAt: Date.now(), installedBy: by
    }
    try {
      this.repo.insert(stored)
    } catch (error) {
      await this.directory.removeVersion(id, version)
      throw error
    }
    this.problemsByVersion.delete(`${id}@${version}`)
    return stored
  }

  /**
   * The catalog entry of a stored version, after checking its bundle's sha256. A description a
   * newer Nexus can't read any more is described again from the bundle and stored.
   * @returns undefined when the version is unavailable; problem() says why
   */
  async load(stored: StoredVersion): Promise<Omit<CatalogEntry, "source"> | undefined> {
    const { pluginId: id, version } = stored
    const key = `${id}@${version}`
    try {
      const entry = this.directory.entryFile(id, version, stored.entry)
      const sha = await PluginDirectory.sha256(entry).catch(() => undefined)
      if (sha === undefined) return this.unavailable(key, "its files are missing")
      if (sha !== stored.bundleSha256) return this.unavailable(key, "its bundle changed on disk since it was installed")
      const description = await this.description(stored, entry)
      this.problemsByVersion.delete(key)
      return { pkg: { id, name: stored.name, entry, description }, version, ...(stored.icon ? { icon: stored.icon } : {}) }
    } catch (error) {
      this.log.warn({ err: error, plugin: id, version }, "installed plugin can't be loaded")
      return this.unavailable(key, `it can't be loaded: ${error instanceof Error ? error.message.slice(0, 300) : String(error)}`)
    }
  }

  /** removes the rows first; folders that can't be removed now are orphans that the next boot deletes */
  async uninstall(id: string) {
    this.repo.delete(id)
    await this.directory.removePlugin(id).catch((error: unknown) => this.log.warn({ err: error, plugin: id }, "removing an uninstalled plugin's files failed"))
    for (const key of this.problemsByVersion.keys()) if (key.startsWith(`${id}@`)) this.problemsByVersion.delete(key)
  }

  private async description(stored: StoredVersion, entry: string) {
    let json: unknown
    try {
      json = JSON.parse(stored.description)
    } catch {
      json = undefined
    }
    const parsed = PluginDescriptionSchema.safeParse(json)
    if (parsed.success) return parsed.data
    this.log.info({ plugin: stored.pluginId, version: stored.version }, "describing an installed plugin again")
    const description = await this.describer.describe(entry)
    this.repo.setDescription(stored.pluginId, stored.version, JSON.stringify(description))
    return description
  }

  private unavailable(key: string, problem: string) {
    this.problemsByVersion.set(key, problem)
    return undefined
  }
}
