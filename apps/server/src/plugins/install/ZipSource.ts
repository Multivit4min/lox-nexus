import { createHash } from "node:crypto"
import { InstallError } from "./InstallError.ts"
import type { InstallLimits } from "./InstallLimits.ts"
import { ManifestValidator } from "./ManifestValidator.ts"
import { PackageWriter } from "./PackageWriter.ts"
import type { FetchedPackage, PluginSource } from "./PluginSource.ts"
import { ZipArchive } from "./ZipArchive.ts"
import { ZipEntryPolicy } from "./ZipEntryPolicy.ts"

/**
 * An uploaded ZIP. The package is either at the archive's root or in its only top-level folder
 * (how "download as ZIP" and most zip tools pack a folder); macOS metadata is ignored.
 */
export class ZipSource implements PluginSource {
  constructor(private readonly data: Buffer, private readonly fileName: string, private readonly limits: InstallLimits) {}

  async fetch(packageDir: string): Promise<FetchedPackage> {
    if (this.data.length > this.limits.uploadBytes) throw new InstallError("invalid-source", "the archive is too large")
    const archive = await ZipArchive.open(this.data, new ZipEntryPolicy(this.limits))
    try {
      const root = ZipSource.root(archive.names())
      const manifestBytes = await archive.read(`${root}package.json`, this.limits.manifestBytes)
      const manifest = ManifestValidator.parse(manifestBytes)
      const entry = `${root}${manifest.entry}`
      if (!archive.has(entry)) throw new InstallError("invalid-package", `the bundle "${manifest.entry}" is not in the archive; build the plugin before packing it`)
      const bundle = await archive.read(entry, this.limits.bundleBytes)
      const map = archive.has(`${entry}.map`) ? await archive.read(`${entry}.map`, this.limits.bundleBytes) : undefined
      await PackageWriter.write(packageDir, manifest, { manifest: manifestBytes, bundle, ...(map ? { map } : {}) })
      const archiveSha256 = createHash("sha256").update(this.data).digest("hex")
      return { origin: { kind: "zip", fileName: this.fileName, archiveSha256 }, manifest }
    } finally {
      archive.close()
    }
  }

  /** "" or "<folder>/" */
  static root(names: string[]) {
    const relevant = names.filter(name => !name.startsWith("__MACOSX/") && name.split("/").at(-1) !== ".DS_Store")
    if (relevant.includes("package.json")) return ""
    const tops = new Set(relevant.map(name => name.split("/")[0]!))
    const [only] = tops
    if (tops.size === 1 && only && relevant.includes(`${only}/package.json`)) return `${only}/`
    throw new InstallError("invalid-package", "package.json must be at the archive's root or in its only top-level folder")
  }
}
