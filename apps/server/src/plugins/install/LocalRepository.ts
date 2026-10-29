import fs from "node:fs"
import path from "node:path"
import { BuildStamp } from "./BuildStamp.ts"
import { InstallError } from "./InstallError.ts"
import type { InstallLimits } from "./InstallLimits.ts"
import { ManifestValidator, type InstallManifest } from "./ManifestValidator.ts"
import { PackageWriter } from "./PackageWriter.ts"
import { PluginDirectory } from "./PluginDirectory.ts"

/** A folder of the local repository that declares a plugin. */
export interface LocalPlugin {
  /** the folder's name, unique within the repository */
  folder: string
  /** absolute */
  dir: string
  /** absent when package.json isn't installable */
  manifest?: InstallManifest
  /** why it can't be installed (also when the bundle isn't built yet) */
  problem?: string
}

/**
 * A folder on the server with one plugin per subfolder, each with package.json and its built
 * bundle; the workspace's plugins/ folder is one. It is read again on every request, so a plugin
 * copied there or rebuilt shows up without a restart. Versions are listed with their bundle's
 * stamp (BuildStamp), as they would be installed. No plugin code runs until one is staged.
 */
export class LocalRepository {
  // a bundle is hashed again only when it changes, not at every listing
  private readonly stamps = new Map<string, { key: string; version: string }>()

  /** @param dir absolute; undefined or a missing folder is an empty repository */
  constructor(readonly dir: string | undefined, private readonly limits: InstallLimits) {}

  /** subfolders that declare a plugin (package.json with a loxNexus block), sorted by folder */
  list(): LocalPlugin[] {
    const dir = this.dir
    if (!dir || !fs.existsSync(dir)) return []
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && !entry.name.startsWith("."))
      .map(entry => this.read(entry.name, path.join(dir, entry.name)))
      .filter(plugin => plugin !== undefined)
      .sort((a, b) => a.folder.localeCompare(b.folder))
  }

  /**
   * Looks a folder up by name among the listed ones, so a client never names a path.
   * @throws InstallError not-found, or invalid-package when it can't be installed
   */
  find(folder: string): LocalPlugin & { manifest: InstallManifest } {
    const plugin = this.list().find(candidate => candidate.folder === folder)
    if (!plugin) throw new InstallError("not-found", `the local plugin repository has no plugin folder "${folder}"`)
    if (!plugin.manifest || plugin.problem) throw new InstallError("invalid-package", plugin.problem ?? "it can't be installed")
    return { ...plugin, manifest: plugin.manifest }
  }

  private read(folder: string, dir: string): LocalPlugin | undefined {
    const file = path.join(dir, "package.json")
    let text: Buffer
    try {
      const stat = fs.lstatSync(file)
      if (!stat.isFile() || stat.size > this.limits.manifestBytes) return { folder, dir, problem: "package.json is not a plain file or is too large" }
      text = fs.readFileSync(file)
    } catch {
      return undefined
    }
    if (!ManifestValidator.declaresPlugin(text)) return undefined
    try {
      const manifest = ManifestValidator.parse(text)
      const entry = PluginDirectory.inside(dir, manifest.entry)
      if (!fs.existsSync(entry)) {
        return { folder, dir, manifest, problem: `not built: ${manifest.entry} is missing (run npm run build in the plugin's folder)` }
      }
      return { folder, dir, manifest: { ...manifest, version: this.stamped(manifest.version, entry, dir) } }
    } catch (error) {
      return { folder, dir, problem: error instanceof Error ? error.message : String(error) }
    }
  }

  // a bundle that isn't a plain file or is too large is listed unstamped; installing it says why it can't be.
  // The README counts as installing would take it: a plain file within the limit.
  private stamped(authored: string, entry: string, dir: string): string {
    const stat = fs.lstatSync(entry)
    if (!stat.isFile() || stat.size > this.limits.bundleBytes) return authored
    const readme = PackageWriter.README_NAMES.map(name => path.join(dir, name)).find(file => fs.existsSync(file))
    const readmeStat = readme === undefined ? undefined : fs.lstatSync(readme)
    const kept = readme !== undefined && readmeStat?.isFile() === true && readmeStat.size <= this.limits.readmeBytes ? readme : undefined
    const key = JSON.stringify([authored, stat.mtimeMs, stat.size, kept, kept && readmeStat?.mtimeMs, kept && readmeStat?.size])
    const cached = this.stamps.get(entry)
    if (cached?.key === key) return cached.version
    const version = BuildStamp.version(authored, fs.readFileSync(entry), kept === undefined ? undefined : fs.readFileSync(kept))
    this.stamps.set(entry, { key, version })
    return version
  }
}
