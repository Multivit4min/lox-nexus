import fs from "node:fs"
import path from "node:path"
import type { PackageDescriber } from "@lox-nexus/core"
import type { PluginDescription } from "@lox-nexus/plugin-sdk/wire"
import { InstallError } from "./InstallError.ts"
import type { InstallLimits } from "./InstallLimits.ts"
import { PluginDirectory } from "./PluginDirectory.ts"
import type { FetchedPackage } from "./PluginSource.ts"

/** A fetched package that passed every check, still in its staging folder. */
export interface StagedPackage extends FetchedPackage {
  /** the staging folder holding package.json and the bundle */
  packageDir: string
  bundleSha256: string
  description: PluginDescription
}

/**
 * Checks what a source wrote, then asks a throwaway worker what the plugin offers. This runs the
 * plugin's code once, which is why the UI shows the trust warning before anything is fetched.
 */
export class PackageInspector {
  constructor(private readonly describer: Pick<PackageDescriber, "describe">, private readonly limits: InstallLimits) {}

  /** @throws InstallError invalid-package or describe-failed */
  async inspect(packageDir: string, fetched: FetchedPackage): Promise<StagedPackage> {
    await PackageInspector.plainFile(path.join(packageDir, "package.json"), this.limits.manifestBytes)
    const entry = PluginDirectory.inside(packageDir, fetched.manifest.entry)
    await PackageInspector.plainFile(entry, this.limits.bundleBytes)
    const bundleSha256 = await PluginDirectory.sha256(entry)
    let description: PluginDescription
    try {
      description = await this.describer.describe(entry, { heapMb: fetched.manifest.heapMb })
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).replaceAll(packageDir, "<package>").slice(0, 500)
      throw new InstallError("describe-failed", `the plugin could not be loaded: ${message}`)
    }
    return { ...fetched, packageDir, bundleSha256, description }
  }

  private static async plainFile(file: string, maxBytes: number) {
    const stat = await fs.promises.lstat(file).catch(() => undefined)
    if (!stat?.isFile()) throw new InstallError("invalid-package", `${path.basename(file)} is missing or not a plain file`)
    if (stat.size > maxBytes) throw new InstallError("invalid-package", `${path.basename(file)} is too large`)
  }
}
