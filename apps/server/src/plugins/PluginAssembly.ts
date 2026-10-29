import { DEFAULT_TIMINGS, PackageDescriber, type PluginTransport } from "@lox-nexus/core"
import { Disposable } from "@lox-nexus/plugin-sdk"
import type { Logger } from "pino"
import type { Config } from "../config/Config.ts"
import type { PluginPackageRepository } from "../db/repositories/PluginPackageRepository.ts"
import type { PluginSignalRepository } from "../db/repositories/PluginSignalRepository.ts"
import { PluginPackageService } from "../services/PluginPackageService.ts"
import type { PluginService } from "../services/PluginService.ts"
import { DevPluginLoader } from "./DevPluginLoader.ts"
import { GitRunner } from "./install/GitRunner.ts"
import { InstalledPluginLoader } from "./install/InstalledPluginLoader.ts"
import { InstallLimits } from "./install/InstallLimits.ts"
import { LocalRepository } from "./install/LocalRepository.ts"
import { PackageInspector } from "./install/PackageInspector.ts"
import { PendingInstalls } from "./install/PendingInstalls.ts"
import { PluginDirectory } from "./install/PluginDirectory.ts"
import { PluginInstaller } from "./install/PluginInstaller.ts"
import { PluginSources } from "./install/PluginSources.ts"
import { PluginSwitch } from "./install/PluginSwitch.ts"
import { PluginVersions } from "./install/PluginVersions.ts"
import { StagingArea } from "./install/StagingArea.ts"
import { PluginCatalog } from "./PluginCatalog.ts"

/** Installer overrides for tests; production uses the defaults. */
export interface InstallOptions {
  limits?: Partial<InstallLimits>
  /** URL schemes git may fetch from; tests add "file" for a local bare repository */
  gitSchemes?: string[]
  /** the git executable; tests point it at a fake */
  gitBinary?: string
}

/**
 * The plugin wiring of NexusApp: the catalog, both loaders, and the installer. Constructed only by
 * NexusApp (it is part of the composition root, split out to keep NexusApp short).
 */
export class PluginAssembly extends Disposable {
  /** the plugins instances can be created from: installed ones, and development copies on top */
  readonly catalog = new PluginCatalog()
  private readonly limits: InstallLimits
  private readonly directory: PluginDirectory
  private readonly staging: StagingArea
  private readonly versions: PluginVersions
  /** throwaway workers with the install timings, for staged and installed bundles */
  private readonly describer: PackageDescriber
  private readonly log: Logger
  private packageService: PluginPackageService | undefined

  constructor(
    private readonly config: Config,
    private readonly transport: PluginTransport,
    private readonly repo: PluginPackageRepository,
    private readonly signalRepo: Pick<PluginSignalRepository, "listFor">,
    log: Logger,
    private readonly options: InstallOptions = {}
  ) {
    super()
    this.log = log.child({ component: "plugins" })
    this.limits = new InstallLimits(options.limits)
    this.directory = new PluginDirectory(config.pluginsDir)
    this.staging = new StagingArea(this.directory.stagingDir, this.log)
    this.describer = new PackageDescriber(transport, { ...DEFAULT_TIMINGS, helloMs: this.limits.describeMs, requestMs: this.limits.describeMs })
    this.versions = new PluginVersions(this.directory, repo, this.describer, this.log)
  }

  /** boot: installed plugins first, then development copies over them; one that fails is logged and skipped */
  async load(plugins: PluginService) {
    await new InstalledPluginLoader(this.directory, this.staging, this.repo, this.versions, this.catalog, this.log).load()
    const dir = this.config.devPluginsDir
    if (dir && !this.isDisposed) {
      // development only: plugins/* from source, described by throwaway workers, reloaded on change
      const loader = this.own(new DevPluginLoader(dir, new PackageDescriber(this.transport), this.catalog, pkg => plugins.packageChanged(pkg), this.log))
      await loader.load()
      loader.watch()
    }
    this.log.info({ plugins: this.catalog.list().map(entry => `${entry.pkg.id} (${entry.source})`) }, "plugins loaded")
  }

  /** the installer's service for the API; the first call builds it, later calls return the same one */
  packages(plugins: PluginService) {
    this.packageService ??= this.buildPackages(plugins)
    return this.packageService
  }

  private buildPackages(plugins: PluginService) {
    const installLog = this.log.child({ component: "installer" })
    const pending = this.own(new PendingInstalls(this.staging, this.limits.pendingMs))
    const runner = new GitRunner({ timeoutMs: this.limits.gitTimeoutMs, ...(this.options.gitBinary ? { binary: this.options.gitBinary } : {}), ...(this.options.gitSchemes ? { protocols: this.options.gitSchemes } : {}) }, installLog)
    // a shutdown during a git fetch must not leave git downloading
    this.onDispose(() => runner.stopAll())
    const sources = new PluginSources(this.limits, runner, new LocalRepository(this.config.pluginRepositoryDir, this.limits), this.options.gitSchemes)
    const installer = new PluginInstaller({ staging: this.staging, pending, inspector: new PackageInspector(this.describer, this.limits), versions: this.versions, repo: this.repo, log: installLog })
    const switcher = new PluginSwitch({ versions: this.versions, repo: this.repo, catalog: this.catalog, plugins, signals: this.signalRepo })
    return new PluginPackageService({
      installer, versions: this.versions, repo: this.repo, catalog: this.catalog, sources, switcher, plugins, uploadBytes: this.limits.uploadBytes, readmeBytes: this.limits.readmeBytes, log: installLog
    })
  }
}
