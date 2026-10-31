import type { CapabilityDescription, PluginDescription } from "@lox-nexus/plugin-sdk/wire"

/** The sensors and actuators a plugin offers, looked up as signals name them: by kind and capability id. */
export class Capabilities {
  /** what the plugin offers of this kind; none without a description (a plugin that isn't installed) */
  static offered(description: PluginDescription | undefined, kind: "sensor" | "actuator"): CapabilityDescription[] {
    if (!description) return []
    return kind === "sensor" ? description.sensors : description.actuators
  }

  /** the capability a signal or catalog entry names; undefined when the plugin doesn't offer it (any more) */
  static of(description: PluginDescription | undefined, signal: { kind: "sensor" | "actuator"; capability: string }): CapabilityDescription | undefined {
    return Capabilities.offered(description, signal.kind).find(offered => offered.id === signal.capability)
  }
}
