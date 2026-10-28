import type { Logger } from "pino"
import type { PluginPackageRepository } from "../../db/repositories/PluginPackageRepository.ts"
import type { PluginCatalog } from "../PluginCatalog.ts"
import type { PluginDirectory } from "./PluginDirectory.ts"
import type { PluginVersions } from "./PluginVersions.ts"
import type { StagingArea } from "./StagingArea.ts"

/**
 * Boot: cleans up what an interrupted install left, then puts every installed plugin's active
 * version into the catalog. The database decides what is installed; a folder without a row is
 * an orphan (a crash between the move and the transaction) and is deleted. One broken plugin is
 * logged and skipped.
 */
export class InstalledPluginLoader {
  constructor(
    private readonly directory: PluginDirectory,
    private readonly staging: StagingArea,
    private readonly repo: PluginPackageRepository,
    private readonly versions: PluginVersions,
    private readonly catalog: Pick<PluginCatalog, "setInstalled">,
    private readonly log: Logger
  ) {}

  async load() {
    await this.staging.sweep()
    await this.removeOrphans()
    for (const stored of this.repo.list()) {
      const entry = await this.versions.load(stored.active)
      if (entry) this.catalog.setInstalled(entry)
      else this.log.warn({ plugin: stored.id, version: stored.active.version, problem: this.versions.problem(stored.id, stored.active.version) }, "installed plugin is unavailable")
    }
  }

  // leftover files never stop a boot: what can't be removed now is logged and tried again next time
  private async removeOrphans() {
    const known = new Set(this.repo.versions().map(row => `${row.pluginId}/${row.version}`))
    const onDisk = this.directory.listOnDisk(error => this.log.warn({ err: error }, "an installed plugin folder can't be read"))
    for (const { id, version } of onDisk) {
      if (known.has(`${id}/${version}`)) continue
      this.log.warn({ plugin: id, version }, "removing an installed plugin folder that has no database row")
      await this.directory.removeVersion(id, version).catch((error: unknown) => this.log.warn({ err: error, plugin: id, version }, "removing the folder failed"))
    }
  }
}
