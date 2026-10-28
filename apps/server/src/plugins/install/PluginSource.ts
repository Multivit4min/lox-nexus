import type { PluginSourceDto } from "@lox-nexus/api"
import type { InstallManifest } from "./ManifestValidator.ts"

/** What a source fetched: where it came from and the validated manifest. */
export interface FetchedPackage {
  origin: PluginSourceDto
  manifest: InstallManifest
}

/**
 * Somewhere a plugin is installed from. A source writes exactly package.json, the bundle and,
 * if present, the bundle's source map into `packageDir`; nothing else from it is ever written.
 */
export interface PluginSource {
  /** @throws InstallError when the source or the package is unusable */
  fetch(packageDir: string): Promise<FetchedPackage>
}
