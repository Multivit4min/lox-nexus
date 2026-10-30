import { WIRE_VERSION } from "@lox-nexus/plugin-sdk/wire"

/**
 * The wire versions this host runs plugins of (ADR 0019): the SDK's current one and, after a
 * bump, the one before it for at least one more release, translated by an adapter. Only version 1
 * exists so far, so the set has one member; the checks already treat it as a set.
 */
export class WireVersions {
  static readonly SUPPORTED: readonly number[] = [WIRE_VERSION]

  static accepts(version: number) {
    return WireVersions.SUPPORTED.includes(version)
  }

  /** why a plugin built for `version` can't run here, saying which side to update; undefined when it can */
  static refusal(version: number) {
    if (WireVersions.accepts(version)) return undefined
    const supported = WireVersions.SUPPORTED.join(" or ")
    return version > Math.max(...WireVersions.SUPPORTED)
      ? `the plugin needs wire version ${version}, this Nexus runs ${supported}: update Nexus`
      : `the plugin speaks wire version ${version}, which this Nexus no longer runs (${supported}): update the plugin`
  }
}
