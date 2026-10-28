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
 * module afresh, so a restart picks up the edit; the host never imports plugin code itself. The
 * whole directory is watched, so a plugin that failed to load, or one added later, loads as soon
 * as its files change.
 */
export class DevPluginLoader extends Disposable {
  /** edits arrive in bursts (save, format, rebuild); one restart per burst */
  static readonly DEBOUNCE_MS = 300
  /** folders inside a plugin whose changes don't affect what development runs */
  static readonly IGNORED: ReadonlySet<string> = new Set(["dist", "node_modules"])
  private readonly pending = new Map<string, () => void>()
  /** reloads of one plugin run one after another, so a slow describe can't overtake a newer one */
  private readonly queues = new Map<string, Promise<void>>()

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

  /** watches the directory and reloads a plugin once its files stop changing */
  watch() {
    if (!fs.existsSync(this.dir)) return
    const watcher = fs.watch(this.dir, { recursive: true }, (_event, file) => {
      const [name, inside] = file?.toString().split(path.sep) ?? []
      // development runs src/; a build (npm run plugins:build) or an install must not restart every instance
      if (inside && DevPluginLoader.IGNORED.has(inside)) return
      if (name && !this.isDisposed) this.schedule(name)
    })
    // a watcher error (the directory was removed, too many files) must not take the server down
    watcher.on("error", error => this.log.warn({ err: error }, "watching the development plugins stopped"))
    this.onDispose(() => watcher.close())
  }

  private schedule(name: string) {
    this.pending.get(name)?.()
    this.pending.set(name, this.after(DevPluginLoader.DEBOUNCE_MS, () => {
      this.pending.delete(name)
      const next = (this.queues.get(name) ?? Promise.resolve()).then(() => this.reload(path.join(this.dir, name)))
      this.queues.set(name, next)
    }))
  }

  private async reload(root: string) {
    const pkg = await this.loadOne(root)
    if (!pkg || this.isDisposed) return
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
      this.catalog.setDevelopment({ pkg, version: manifest.version, ...(icon ? { icon } : {}) })
      return pkg
    } catch (error) {
      this.log.warn({ err: error, plugin: path.basename(root) }, "skipping a development plugin that can't be loaded")
      return undefined
    }
  }
}
