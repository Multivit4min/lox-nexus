import { createHash } from "node:crypto"

/**
 * Versions of plugins from the local repository get the hash of what gets installed (the bundle,
 * and the README when there is one) as semver build metadata (`0.1.0` → `0.1.0+3f6c2a1b`). A
 * version names one bundle forever, so without it a plugin rebuilt after a pull, its version
 * unchanged, could not be installed; with it the rebuild is a new version that installs as an
 * update, an edited README too, and an unchanged rebuild keeps its stamp. A version that already
 * has build metadata is left as it is: its author stamps it.
 */
export class BuildStamp {
  static readonly LENGTH = 8

  /** the version as installed from this bundle and README; without a README the bundle's hash alone, as before */
  static version(version: string, bundle: Buffer, readme?: Buffer): string {
    if (version.includes("+")) return version
    const hash = createHash("sha256").update(bundle)
    if (readme) hash.update("\0README\0").update(readme)
    return `${version}+${hash.digest("hex").slice(0, BuildStamp.LENGTH)}`
  }

  /** package.json with `version` replaced; the rest stays as the author wrote it */
  static manifest(manifest: Buffer, version: string): Buffer {
    const json = JSON.parse(manifest.toString("utf8")) as Record<string, unknown>
    return Buffer.from(`${JSON.stringify({ ...json, version }, null, 2)}\n`)
  }
}
