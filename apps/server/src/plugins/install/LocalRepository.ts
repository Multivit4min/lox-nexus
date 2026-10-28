import fs from "node:fs"
import path from "node:path"
import { InstallError } from "./InstallError.ts"
import type { InstallLimits } from "./InstallLimits.ts"
import { ManifestValidator, type InstallManifest } from "./ManifestValidator.ts"
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
 * copied there or rebuilt shows up without a restart. Only package.json is read here; no plugin
 * code runs until one is staged.
 */
export class LocalRepository {
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
      if (!fs.existsSync(PluginDirectory.inside(dir, manifest.entry))) {
        return { folder, dir, manifest, problem: `not built: ${manifest.entry} is missing (run npm run build in the plugin's folder)` }
      }
      return { folder, dir, manifest }
    } catch (error) {
      return { folder, dir, problem: error instanceof Error ? error.message : String(error) }
    }
  }
}
