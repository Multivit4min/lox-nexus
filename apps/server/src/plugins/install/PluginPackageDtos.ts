import type { InstalledPluginDto, PluginVersionDto, RepositoryPluginDto, StagedInstallDto } from "@lox-nexus/api"
import type { StoredPackage, StoredVersion } from "../../db/repositories/PluginPackageRepository.ts"
import type { PluginCatalog } from "../PluginCatalog.ts"
import type { LocalPlugin } from "./LocalRepository.ts"
import type { StageResult } from "./PluginInstaller.ts"
import type { PluginVersions } from "./PluginVersions.ts"

/** Shapes installer state into the API's DTOs. */
export class PluginPackageDtos {
  constructor(private readonly versions: Pick<PluginVersions, "problem">, private readonly catalog: Pick<PluginCatalog, "installed" | "shadowed">) {}

  /** @param instances the stored instances that use this plugin */
  installed(stored: StoredPackage, instances: ReadonlyArray<{ id: string; label: string }>): InstalledPluginDto {
    const { active, previous } = stored
    const loaded = this.catalog.installed(stored.id)?.version === active.version
    return {
      id: stored.id, name: active.name, ...(active.icon ? { icon: active.icon } : {}),
      active: this.version(active, loaded),
      ...(previous ? { previous: this.version(previous, this.versions.problem(stored.id, previous.version) === undefined) } : {}),
      instances: instances.length,
      instanceNames: instances.map(instance => instance.label || instance.id),
      shadowedByDevelopment: this.catalog.shadowed(stored.id)
    }
  }

  static staged(result: StageResult): StagedInstallDto {
    const { stagingId, expiresAt, staged } = result.pending
    const { id, name, version, icon, heapMb } = staged.manifest
    return {
      stagingId, expiresAt, id, name, version, ...(icon ? { icon } : {}), ...(heapMb ? { heapMb } : {}), source: staged.origin, bundleSha256: staged.bundleSha256,
      sensors: staged.description.sensors.length, actuators: staged.description.actuators.length,
      ...(staged.description.watches ? { watches: true } : {}),
      ...(result.installedVersion ? { installedVersion: result.installedVersion } : {}), sameAsInstalled: result.sameAsInstalled
    }
  }

  static repository(plugin: LocalPlugin, installedVersion: string | undefined): RepositoryPluginDto {
    const manifest = plugin.manifest
    return {
      folder: plugin.folder,
      ...(manifest ? { id: manifest.id, name: manifest.name, version: manifest.version, ...(manifest.icon ? { icon: manifest.icon } : {}) } : {}),
      ...(plugin.problem ? { problem: plugin.problem } : {}),
      ...(installedVersion ? { installedVersion } : {})
    }
  }

  private version(stored: StoredVersion, available: boolean): PluginVersionDto {
    const problem = this.versions.problem(stored.pluginId, stored.version)
    return {
      version: stored.version, source: stored.source, bundleSha256: stored.bundleSha256, installedAt: stored.installedAt, installedBy: stored.installedBy,
      available: available && problem === undefined, ...(problem ? { problem } : {})
    }
  }
}
