/**
 * The manifest formats this Nexus reads. `apiVersion` versions the `loxNexus` block of a plugin's
 * package.json and nothing else; the protocol a bundle speaks is its wire version, checked at
 * every start (ADR 0019).
 */
export class ManifestVersions {
  static readonly SUPPORTED: readonly number[] = [1]

  /** why a manifest of this format can't be installed here, saying which side to update; undefined when it can */
  static refusal(version: number) {
    if (ManifestVersions.SUPPORTED.includes(version)) return undefined
    const supported = ManifestVersions.SUPPORTED.join(" or ")
    return version > Math.max(...ManifestVersions.SUPPORTED)
      ? `manifest apiVersion ${version} is newer than this Nexus reads (${supported}): update Nexus`
      : `manifest apiVersion ${version} is no longer read by this Nexus (${supported}): update the plugin`
  }
}
