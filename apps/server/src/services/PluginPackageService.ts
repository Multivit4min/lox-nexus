import type { GitInstallInput, InstallOutcomeDto, InstalledPluginDto, RepositoryPluginDto, StagedInstallDto } from "@lox-nexus/api"
import type { Logger } from "pino"
import type { PluginPackageRepository } from "../db/repositories/PluginPackageRepository.ts"
import { InstallError } from "../plugins/install/InstallError.ts"
import { OperationLock } from "../plugins/install/OperationLock.ts"
import type { PluginInstaller } from "../plugins/install/PluginInstaller.ts"
import { PluginPackageDtos } from "../plugins/install/PluginPackageDtos.ts"
import type { PluginSource } from "../plugins/install/PluginSource.ts"
import type { PluginSources } from "../plugins/install/PluginSources.ts"
import type { PluginVersions } from "../plugins/install/PluginVersions.ts"
import type { PluginCatalog } from "../plugins/PluginCatalog.ts"
import type { PluginService } from "./PluginService.ts"

/** What the package service works with; built by PluginAssembly. */
export interface PluginPackageDeps {
  installer: PluginInstaller
  versions: PluginVersions
  repo: PluginPackageRepository
  catalog: PluginCatalog
  sources: PluginSources
  plugins: Pick<PluginService, "packageChanged" | "list">
  /** the ZIP upload cap, for the controller's body limit */
  uploadBytes: number
  log: Logger
}

/**
 * Installed plugins, for the API: lists them, runs installs and uninstalls one at a time, and
 * keeps the catalog and the running instances in step with what is installed.
 */
export class PluginPackageService {
  private readonly lock = new OperationLock()
  private readonly dtos: PluginPackageDtos

  constructor(private readonly deps: PluginPackageDeps) {
    this.dtos = new PluginPackageDtos(deps.versions, deps.catalog)
  }

  /** the largest ZIP an upload may send */
  get uploadBytes() {
    return this.deps.uploadBytes
  }

  list(): InstalledPluginDto[] {
    const instances = this.deps.plugins.list()
    return this.deps.repo.list().map(stored => this.dtos.installed(stored, instances.filter(instance => instance.plugin === stored.id).length))
  }

  /** the plugins in the server's local repository folder, with the installed version of each */
  repository(): RepositoryPluginDto[] {
    return this.deps.sources.repository.list().map(plugin =>
      PluginPackageDtos.repository(plugin, plugin.manifest && this.deps.repo.get(plugin.manifest.id)?.active.version))
  }

  stageGit(input: GitInstallInput, by: string) {
    return this.stage(() => this.deps.sources.git(input), by)
  }

  stageZip(data: Buffer, fileName: string, by: string) {
    return this.stage(() => this.deps.sources.zip(data, fileName), by)
  }

  stageLocal(folder: string, by: string) {
    return this.stage(() => this.deps.sources.local(folder), by)
  }

  /**
   * Installs the staged plugin. When it is the copy instances run (no development copy hides
   * it), instances that were waiting for it get a supervisor and start if enabled.
   */
  confirm(stagingId: string, expectedActive: string | null, by: string): Promise<InstallOutcomeDto> {
    return this.lock.run(async () => {
      const { stored, changed } = await this.deps.installer.confirm(stagingId, expectedActive, by)
      const id = stored.pluginId
      if (changed) {
        const entry = await this.deps.versions.load(stored)
        if (!entry) throw new InstallError("invalid-package", `${stored.name} was installed but can't be loaded: ${this.deps.versions.problem(id, stored.version) ?? "unknown reason"}`)
        this.deps.catalog.setInstalled(entry)
        if (this.deps.catalog.get(id)?.source === "installed") await this.deps.plugins.packageChanged(entry.pkg)
      }
      return this.outcome(id)
    })
  }

  /** @throws InstallError not-found when nothing with that id is staged */
  async discard(stagingId: string, by: string) {
    if (!await this.deps.installer.discard(stagingId)) throw new InstallError("not-found", "nothing with that id is waiting for confirmation")
    this.deps.log.info({ by, stagingId }, "staged plugin discarded")
  }

  /**
   * Removes every version of a plugin. Refused while instances of it exist: deleting those also
   * deletes their signals and wires, which stays an explicit step.
   * @throws InstallError not-found, in-use
   */
  uninstall(id: string, by: string) {
    return this.lock.run(async () => {
      const stored = this.deps.repo.get(id)
      if (!stored) throw new InstallError("not-found", `no installed plugin "${id}"`)
      const users = this.deps.plugins.list().filter(instance => instance.plugin === id)
      if (users.length > 0) throw new InstallError("in-use", `${stored.active.name} is used by ${users.map(instance => `"${instance.label || instance.slug}"`).join(", ")}; delete those instances first`)
      // before any await: no instance may be created from it while its files are removed
      this.deps.catalog.removeInstalled(id)
      await this.deps.versions.uninstall(id)
      this.deps.log.info({ by, plugin: id }, "plugin uninstalled")
    })
  }

  // a refused URL, ref or folder is logged like a refused package
  private async stage(source: () => PluginSource, by: string): Promise<StagedInstallDto> {
    let built: PluginSource
    try {
      built = source()
    } catch (error) {
      if (error instanceof InstallError) this.deps.log.warn({ by, reason: error.reason, problem: error.message }, "plugin install refused")
      throw error
    }
    return PluginPackageDtos.staged(await this.lock.run(() => this.deps.installer.stage(built, by)))
  }

  private outcome(id: string): InstallOutcomeDto {
    const stored = this.deps.repo.get(id)
    if (!stored) throw new InstallError("not-found", `no installed plugin "${id}"`)
    const instances = this.deps.plugins.list().filter(instance => instance.plugin === id)
    return {
      plugin: this.dtos.installed(stored, instances.length),
      instances: instances.map(({ id: instanceId, label, state, lastError }) => ({ id: instanceId, label, state, ...(lastError ? { lastError } : {}) }))
    }
  }
}
