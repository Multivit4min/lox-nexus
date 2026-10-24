import fs from "node:fs"
import path from "node:path"
import type { PackageDescriber, PluginPackage } from "@lox-nexus/core"
import { Disposable } from "@lox-nexus/plugin-sdk"
import type { Logger } from "pino"
import type { PluginCatalog } from "./PluginCatalog.ts"
import { PluginManifestSchema } from "./PluginManifest.ts"

/**
 * Development: runs the workspace's plugins/* from source (src/index.ts, through the tsx the
 * server runs with) and restarts their instances when a file changes. Every worker loads the
 * module afresh, so a restart picks up the edit; the host never imports plugin code itself.
 */
export class DevPluginLoader extends Disposable {
  /** edits arrive in bursts (save, format, rebuild); one restart per burst */
  static readonly DEBOUNCE_MS = 300

  constructor(
    private readonly dir: string,
    private readonly describer: Pick<PackageDescriber, "describe">,
    private readonly catalog: PluginCatalog,
    private readonly changed: (pkg: PluginPackage) => Promise<void>,
    private readonly log: Logger
  ) {
    super()
  }

  /** describes every plugin in the directory; one that fails is logged and skipped */
  async load() {
    const names = fs.existsSync(this.dir) ? fs.readdirSync(this.dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name) : []
    await Promise.all(names.map(name => this.loadOne(path.join(this.dir, name))))
  }

  /** watches the loaded plugins' src folders and reloads a plugin after its files change */
  watch() {
    for (const { pkg } of this.catalog.list()) {
      const root = path.dirname(path.dirname(pkg.entry))
      let cancel = () => {}
      const watcher = fs.watch(path.join(root, "src"), { recursive: true }, () => {
        cancel()
        cancel = this.after(DevPluginLoader.DEBOUNCE_MS, () => void this.reload(root))
      })
      this.onDispose(() => watcher.close())
    }
  }

  private async reload(root: string) {
    const pkg = await this.loadOne(root)
    if (!pkg) return
    this.log.info({ plugin: pkg.id }, "plugin changed, restarting its instances")
    await this.changed(pkg).catch((error: unknown) => this.log.error({ err: error, plugin: pkg.id }, "restarting the plugin failed"))
  }

  private async loadOne(root: string): Promise<PluginPackage | undefined> {
    const manifestFile = path.join(root, "package.json")
    const entry = path.join(root, "src", "index.ts")
    if (!fs.existsSync(manifestFile) || !fs.existsSync(entry)) return undefined
    try {
      const manifest = PluginManifestSchema.parse(JSON.parse(fs.readFileSync(manifestFile, "utf8")))
      const { id, name, icon } = manifest.loxNexus
      const pkg: PluginPackage = { id, name, entry, description: await this.describer.describe(entry) }
      this.catalog.set({ pkg, version: manifest.version, source: "development", ...(icon ? { icon } : {}) })
      return pkg
    } catch (error) {
      this.log.warn({ err: error, plugin: path.basename(root) }, "skipping a development plugin that can't be loaded")
      return undefined
    }
  }
}
