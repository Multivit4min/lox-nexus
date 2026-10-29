import type { ActivateInput, GitInstallInput, InstallOutcomeDto, InstalledPluginDto, PluginReadmeDto, RepositoryPluginDto, StagedInstallDto, UpdateImpactDto } from "@lox-nexus/api"
import type { Logger } from "pino"
import type { PluginPackageRepository } from "../db/repositories/PluginPackageRepository.ts"
import { InstallError } from "../plugins/install/InstallError.ts"
import { OperationLock } from "../plugins/install/OperationLock.ts"
import type { PluginInstaller } from "../plugins/install/PluginInstaller.ts"
import { PluginPackageDtos } from "../plugins/install/PluginPackageDtos.ts"
import type { PluginSource } from "../plugins/install/PluginSource.ts"
import type { PluginSources } from "../plugins/install/PluginSources.ts"
import type { PluginSwitch } from "../plugins/install/PluginSwitch.ts"
import type { PluginVersions } from "../plugins/install/PluginVersions.ts"
import type { PluginCatalog } from "../plugins/PluginCatalog.ts"
import { PluginReadme } from "../plugins/PluginReadme.ts"
import type { PluginService } from "./PluginService.ts"

/** What the package service works with; built by PluginAssembly. */
export interface PluginPackageDeps {
  installer: PluginInstaller
  versions: PluginVersions
  repo: PluginPackageRepository
  catalog: PluginCatalog
  sources: PluginSources
  switcher: PluginSwitch
  plugins: Pick<PluginService, "list">
  /** the ZIP upload cap, for the controller's body limit */
  uploadBytes: number
  /** the largest README shown, as the installer keeps them */
  readmeBytes: number
  log: Logger
}

/**
 * Installed plugins, for the API: lists them, runs installs, updates, rollbacks and uninstalls one
 * at a time, and keeps the catalog and the running instances in step with what is installed.
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
    return this.deps.repo.list().map(stored => this.dtos.installed(stored, instances.filter(instance => instance.plugin === stored.id)))
  }

  /**
   * The README of the version in use. A version installed before Nexus kept READMEs has none: then
   * the development copy's, or the one in the local repository folder the version came from.
   * Undefined when none of them has one.
   */
  readme(id: string): PluginReadmeDto | undefined {
    const max = this.deps.readmeBytes
    const version = PluginReadme.read(this.deps.catalog.installed(id), max)
    if (version !== undefined) return { markdown: version, from: "version" }
    const copy = this.deps.catalog.get(id)
    const development = copy?.source === "development" ? PluginReadme.read(copy, max) : undefined
    if (development !== undefined) return { markdown: development, from: "development" }
    const source = this.deps.repo.get(id)?.active.source
    const repository = source?.kind === "local" ? PluginReadme.read({ dir: source.folder }, max) : undefined
    return repository === undefined ? undefined : { markdown: repository, from: "repository" }
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
   * Installs the staged plugin, a new one or an update. When it is the copy instances run (no
   * development copy hides it), running instances restart on it, failed ones start, and instances
   * that were waiting for it get a supervisor. Versions beyond active and previous are removed.
   */
  confirm(stagingId: string, expectedActive: string | null, by: string): Promise<InstallOutcomeDto> {
    return this.lock.run(async () => {
      const before = this.deps.installer.staged(stagingId)
      const pointers = before && this.deps.repo.get(before.manifest.id)
      const { stored, changed } = await this.deps.installer.confirm(stagingId, expectedActive, by)
      if (changed) {
        await this.deps.switcher.apply(stored).catch(async (error: unknown) => {
          await this.undo(stored.pluginId, pointers && { active: pointers.active.version, previous: pointers.previous?.version })
          throw error
        })
        await this.deps.versions.prune(stored.pluginId)
      }
      return this.outcome(stored.pluginId)
    })
  }

  /**
   * Switches to the stored previous version (a rollback, or forward again after one); the version
   * active before becomes the previous one.
   * @throws InstallError not-found, conflict (changed since the review, or not the previous version), invalid-package (files missing)
   */
  activate(id: string, input: ActivateInput, by: string): Promise<InstallOutcomeDto> {
    return this.lock.run(async () => {
      const stored = this.deps.repo.get(id)
      if (!stored) throw new InstallError("not-found", `no installed plugin "${id}"`)
      if (stored.active.version !== input.expectedActive) throw new InstallError("conflict", `${stored.active.name} changed since it was shown; reload and try again`)
      const target = stored.previous
      if (target?.version !== input.version) throw new InstallError("conflict", `only the previous version${target ? ` (${target.version})` : ""} can be activated`)
      // checked before the switch, so a version with missing files never becomes active
      const entry = await this.deps.switcher.load(target)
      this.deps.versions.activate(id, target.version)
      await this.deps.switcher.apply(target, entry)
      this.deps.log.info({ by, plugin: id, from: stored.active.version, to: target.version }, "plugin version activated")
      return this.outcome(id)
    })
  }

  /** what switching to a stored version would do, for the rollback dialog; @throws InstallError not-found, invalid-package */
  async impact(id: string, version: string): Promise<UpdateImpactDto> {
    const stored = this.deps.repo.version(id, version)
    if (!stored) throw new InstallError("not-found", `no stored version ${version} of "${id}"`)
    const description = await this.deps.versions.description(stored).catch((error: unknown) => {
      throw new InstallError("invalid-package", `${stored.name} ${version} can't be described: ${error instanceof Error ? error.message.slice(0, 300) : String(error)}`)
    })
    return this.deps.switcher.impact(id, description)
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
    const result = await this.lock.run(() => this.deps.installer.stage(built, by))
    const { manifest, description } = result.pending.staged
    const known = this.deps.repo.get(manifest.id) !== undefined || this.deps.switcher.instances(manifest.id).length > 0
    return { ...PluginPackageDtos.staged(result), ...(known ? { impact: await this.deps.switcher.impact(manifest.id, description) } : {}) }
  }

  // a confirmed version that can't be put into service must not stay active for the next boot
  private async undo(id: string, previous: { active: string; previous: string | undefined } | undefined) {
    if (previous) this.deps.repo.restore(id, previous.active, previous.previous)
    else await this.deps.versions.uninstall(id)
    await this.deps.versions.prune(id)
  }

  private outcome(id: string): InstallOutcomeDto {
    const stored = this.deps.repo.get(id)
    if (!stored) throw new InstallError("not-found", `no installed plugin "${id}"`)
    const instances = this.deps.switcher.instances(id)
    return { plugin: this.dtos.installed(stored, instances), instances }
  }
}
