import type { InstalledInstanceDto, UpdateImpactDto } from "@lox-nexus/api"
import type { PluginDescription } from "@lox-nexus/plugin-sdk/wire"
import type { PluginPackageRepository, StoredVersion } from "../../db/repositories/PluginPackageRepository.ts"
import type { PluginSignalRepository } from "../../db/repositories/PluginSignalRepository.ts"
import type { PluginService } from "../../services/PluginService.ts"
import type { CatalogEntry, PluginCatalog } from "../PluginCatalog.ts"
import { InstallError } from "./InstallError.ts"
import type { PluginVersions } from "./PluginVersions.ts"
import { UpdateImpact } from "./UpdateImpact.ts"

/** What switching versions needs; built by PluginAssembly. */
export interface PluginSwitchDeps {
  versions: PluginVersions
  repo: PluginPackageRepository
  catalog: PluginCatalog
  plugins: Pick<PluginService, "packageChanged" | "list">
  signals: Pick<PluginSignalRepository, "listFor">
}

/**
 * Puts an installed version into service without a server restart: its files are checked, the
 * catalog points at it, and, unless a development copy hides it, the instances restart on it
 * (ADR 0010). Also tells beforehand what such a switch does to the instances.
 */
export class PluginSwitch {
  constructor(private readonly deps: PluginSwitchDeps) {}

  /**
   * Makes `stored` the version instances run. Call after the database says it is active.
   * @param loaded its entry, when the caller has just loaded it
   * @throws InstallError invalid-package when its files are missing or changed
   */
  async apply(stored: StoredVersion, loaded?: Omit<CatalogEntry, "source">) {
    const entry = loaded ?? await this.load(stored)
    this.deps.catalog.setInstalled(entry)
    if (this.deps.catalog.get(stored.pluginId)?.source === "installed") await this.deps.plugins.packageChanged(entry.pkg)
  }

  /** @throws InstallError invalid-package when the version can't be used */
  async load(stored: StoredVersion) {
    const entry = await this.deps.versions.load(stored)
    if (entry) return entry
    const problem = this.deps.versions.problem(stored.pluginId, stored.version) ?? "unknown reason"
    throw new InstallError("invalid-package", `${stored.name} ${stored.version} can't be used: ${problem}`)
  }

  /**
   * What switching plugin `id` to `next` does to its instances; also for a plugin not installed
   * yet. An active version whose description can't be read counts as offering nothing, so every
   * capability in use shows up as removed rather than being missed.
   */
  async impact(id: string, next: PluginDescription): Promise<UpdateImpactDto> {
    const active = this.deps.repo.get(id)?.active
    const current = active ? await this.deps.versions.description(active).catch(() => undefined) : undefined
    const instances = this.instances(id).map(instance => ({ instance, signals: this.deps.signals.listFor(instance.id) }))
    return UpdateImpact.of(next, current, instances)
  }

  /** the plugin's instances with their state, e.g. after a switch */
  instances(id: string): InstalledInstanceDto[] {
    return this.deps.plugins.list().filter(instance => instance.plugin === id)
      .map(({ id: instanceId, label, state, lastError }) => ({ id: instanceId, label, state, ...(lastError ? { lastError } : {}) }))
  }
}
