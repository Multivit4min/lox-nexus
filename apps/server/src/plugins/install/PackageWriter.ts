import fs from "node:fs"
import path from "node:path"
import { InstallError } from "./InstallError.ts"
import type { InstallManifest } from "./ManifestValidator.ts"
import { PluginDirectory } from "./PluginDirectory.ts"

/** The bytes a source fetched: the only files that ever get installed. */
export interface PackageFiles {
  manifest: Buffer
  bundle: Buffer
  /** the bundle's source map, `<entry>.map`, if the source has one */
  map?: Buffer
}

/** Writes a fetched package into a staging folder, at paths built from the validated manifest only. */
export class PackageWriter {
  /** @throws InstallError no-space when the disk is full */
  static async write(packageDir: string, manifest: InstallManifest, files: PackageFiles) {
    try {
      await fs.promises.mkdir(packageDir, { recursive: true, mode: 0o700 })
      await fs.promises.writeFile(path.join(packageDir, "package.json"), files.manifest, { mode: 0o600 })
      const entry = PluginDirectory.inside(packageDir, manifest.entry)
      await fs.promises.mkdir(path.dirname(entry), { recursive: true, mode: 0o700 })
      await fs.promises.writeFile(entry, files.bundle, { mode: 0o600 })
      if (files.map) await fs.promises.writeFile(`${entry}.map`, files.map, { mode: 0o600 })
    } catch (error) {
      throw error instanceof InstallError ? error : InstallError.fromFileSystem(error)
    }
  }
}
