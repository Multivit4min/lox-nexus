import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { InstallError } from "./InstallError.ts"

/**
 * The installed plugins on disk: `<root>/<id>/<version>/` holds package.json and the bundle.
 * Every path is built through `inside()`, so no id, version or entry can point outside the root.
 */
export class PluginDirectory {
  /** where install attempts are staged; inside the root so the final rename stays on one file system */
  readonly stagingDir: string

  /** @param root absolute, e.g. <dataDir>/plugins */
  constructor(readonly root: string) {
    this.stagingDir = path.join(root, ".staging")
  }

  /**
   * Joins `parts` onto `root` and checks the result stays below it.
   * @throws InstallError invalid-package
   */
  static inside(root: string, ...parts: string[]) {
    const joined = path.resolve(root, ...parts)
    const relative = path.relative(root, joined)
    if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new InstallError("invalid-package", `the path "${parts.join("/")}" leaves the plugin's folder`)
    }
    return joined
  }

  versionDir(id: string, version: string) {
    return PluginDirectory.inside(this.root, id, version)
  }

  /** the bundle of an installed version */
  entryFile(id: string, version: string, entry: string) {
    return PluginDirectory.inside(this.versionDir(id, version), entry)
  }

  /**
   * Moves a staged package into place in one rename.
   * @throws InstallError exists when that version's folder is there already
   */
  async moveIn(stagedDir: string, id: string, version: string) {
    const target = this.versionDir(id, version)
    await fs.promises.mkdir(path.dirname(target), { recursive: true, mode: 0o700 })
    try {
      await fs.promises.rename(stagedDir, target)
    } catch (error) {
      const code = (error as { code?: unknown }).code
      if (code === "EEXIST" || code === "ENOTEMPTY") throw new InstallError("exists", `${id} ${version} is on disk already`)
      throw InstallError.fromFileSystem(error)
    }
    return target
  }

  /** @throws when the folder exists but can't be removed */
  async removeVersion(id: string, version: string) {
    await fs.promises.rm(this.versionDir(id, version), { recursive: true, force: true })
    // the plugin's folder goes too once its last version is gone
    await fs.promises.rmdir(PluginDirectory.inside(this.root, id)).catch(() => undefined)
  }

  async removePlugin(id: string) {
    await fs.promises.rm(PluginDirectory.inside(this.root, id), { recursive: true, force: true })
  }

  /**
   * Every `<id>/<version>` folder; dot folders (staging) are not plugins.
   * @param unreadable told about a folder that can't be listed, which is then skipped
   */
  listOnDisk(unreadable: (error: unknown) => void): { id: string; version: string }[] {
    const list = (dir: string) => {
      try {
        return PluginDirectory.folders(dir)
      } catch (error) {
        unreadable(error)
        return []
      }
    }
    if (!fs.existsSync(this.root)) return []
    return list(this.root).flatMap(id => list(path.join(this.root, id)).map(version => ({ id, version })))
  }

  /** hex sha256 of a file, streamed */
  static async sha256(file: string) {
    const hash = createHash("sha256")
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk as Buffer)
    return hash.digest("hex")
  }

  private static folders(dir: string) {
    return fs.readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isDirectory() && !entry.name.startsWith(".")).map(entry => entry.name)
  }
}
