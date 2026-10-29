import fs from "node:fs"
import path from "node:path"
import { BuildStamp } from "./BuildStamp.ts"
import { InstallError } from "./InstallError.ts"
import type { InstallLimits } from "./InstallLimits.ts"
import type { LocalPlugin } from "./LocalRepository.ts"
import { ManifestValidator } from "./ManifestValidator.ts"
import { PackageWriter } from "./PackageWriter.ts"
import { PluginDirectory } from "./PluginDirectory.ts"
import type { FetchedPackage, PluginSource } from "./PluginSource.ts"

/**
 * A plugin folder of the local repository. The files are copied, so a rebuild in the folder never
 * changes an installed version; both must be plain files whose real path stays in the folder. The
 * version gets the bundle's stamp (BuildStamp), so a rebuild installs as a new version.
 */
export class LocalSource implements PluginSource {
  constructor(private readonly plugin: LocalPlugin, private readonly limits: InstallLimits) {}

  async fetch(packageDir: string): Promise<FetchedPackage> {
    const { dir } = this.plugin
    // read again: the folder may have changed since it was listed
    const authoredBytes = await this.read("package.json", this.limits.manifestBytes)
    const authored = ManifestValidator.parse(authoredBytes)
    const bundle = await this.read(authored.entry, this.limits.bundleBytes)
    const readme = await this.readme()
    // validated again: the stamp makes the version longer
    const manifestBytes = BuildStamp.manifest(authoredBytes, BuildStamp.version(authored.version, bundle, readme))
    const manifest = ManifestValidator.parse(manifestBytes)
    const map = fs.existsSync(PluginDirectory.inside(dir, `${manifest.entry}.map`)) ? await this.read(`${manifest.entry}.map`, this.limits.bundleBytes) : undefined
    await PackageWriter.write(packageDir, manifest, { manifest: manifestBytes, bundle, ...(map ? { map } : {}), ...(readme ? { readme } : {}) })
    return { origin: { kind: "local", folder: dir }, manifest }
  }

  // optional: one that is too large or not a plain file is left out, and the install goes on
  private async readme(): Promise<Buffer | undefined> {
    const name = PackageWriter.README_NAMES.find(candidate => fs.existsSync(PluginDirectory.inside(this.plugin.dir, candidate)))
    return name === undefined ? undefined : this.read(name, this.limits.readmeBytes).catch(() => undefined)
  }

  private async read(file: string, maxBytes: number) {
    const full = PluginDirectory.inside(this.plugin.dir, file)
    try {
      const stat = await fs.promises.lstat(full)
      if (!stat.isFile()) throw new InstallError("invalid-package", `"${file}" must be a plain file, not a symbolic link or folder`)
      if (stat.size > maxBytes) throw new InstallError("invalid-package", `"${file}" is larger than ${Math.round(maxBytes / 1024)} KiB`)
      // a symlinked parent folder could still lead elsewhere
      const real = path.relative(await fs.promises.realpath(this.plugin.dir), await fs.promises.realpath(full))
      if (real === "" || real === ".." || real.startsWith(`..${path.sep}`) || path.isAbsolute(real)) {
        throw new InstallError("invalid-package", `"${file}" leads out of the plugin's folder through a symbolic link`)
      }
      return await fs.promises.readFile(full)
    } catch (error) {
      if (error instanceof InstallError) throw error
      if ((error as { code?: unknown }).code === "ENOENT") throw new InstallError("invalid-package", `"${file}" is missing; build the plugin first`)
      throw error
    }
  }
}
