import type { CapabilityChangeDto, InstalledInstanceDto, UpdateImpactDto } from "@lox-nexus/api"
import type { PluginSignalConfig } from "@lox-nexus/core"
import type { PluginDescription } from "@lox-nexus/plugin-sdk/wire"
import { z } from "zod"

/** An instance of the plugin with its configured signals. */
export interface ImpactInstance {
  instance: InstalledInstanceDto
  signals: PluginSignalConfig[]
}

type Capability = PluginDescription["sensors"][number]

/** The parts of a JSON Schema the required-settings check reads; anything else is ignored. */
const ConfigSchema = z.object({
  properties: z.record(z.string(), z.object({ default: z.unknown().optional() }).loose()).catch({}),
  required: z.array(z.string()).catch([])
}).loose().catch({ properties: {}, required: [] })

/**
 * What switching a plugin from one description to another does to its instances: which
 * capabilities disappear, change their value type or come back for orphaned signals (and how many
 * configured signals use them), and which settings become required. Computed from descriptions only; no plugin code runs.
 */
export class UpdateImpact {
  /** @param current the active version's description; undefined for a plugin that isn't installed yet */
  static of(next: PluginDescription, current: PluginDescription | undefined, instances: ImpactInstance[]): UpdateImpactDto {
    const signals = instances.flatMap(entry => entry.signals)
    const removed: CapabilityChangeDto[] = []
    const retyped: CapabilityChangeDto[] = []
    const restored: CapabilityChangeDto[] = []
    for (const kind of ["sensor", "actuator"] as const) {
      const before = new Map(UpdateImpact.offered(current, kind).map(capability => [capability.id, capability]))
      const after = new Map(UpdateImpact.offered(next, kind).map(capability => [capability.id, capability]))
      const used = (id: string) => signals.filter(signal => signal.kind === kind && signal.capability === id).length
      // capabilities in use count too: the active version may not offer them (orphans) or be unknown
      const ids = new Set([...before.keys(), ...signals.filter(signal => signal.kind === kind).map(signal => signal.capability)])
      for (const id of ids) {
        const old = before.get(id)
        const now = after.get(id)
        // in use but not offered any more counts even when the current description is unknown
        if (!now) removed.push({ kind, capability: id, signals: used(id) })
        // known to be missing only when there is a current description to compare with
        else if (!old && current) restored.push({ kind, capability: id, signals: used(id) })
        else if (old && old.valueType !== now.valueType) {
          retyped.push({ kind, capability: id, signals: used(id), from: old.valueType, to: now.valueType })
        }
      }
    }
    return { instances: instances.map(entry => entry.instance), removed, retyped, restored, newRequiredConfig: UpdateImpact.newRequired(next, current) }
  }

  private static offered(description: PluginDescription | undefined, kind: "sensor" | "actuator"): Capability[] {
    if (!description) return []
    return kind === "sensor" ? description.sensors : description.actuators
  }

  // a stored config already has what the active version required (or filled in from its default);
  // an optional field may be missing, so becoming required is a new demand too
  private static newRequired(next: PluginDescription, current: PluginDescription | undefined) {
    const after = ConfigSchema.parse(next.config)
    const before = ConfigSchema.parse(current?.config ?? {})
    const covered = new Set(before.required)
    for (const [name, field] of Object.entries(before.properties)) if (field.default !== undefined) covered.add(name)
    return after.required.filter(name => after.properties[name]?.default === undefined && !covered.has(name))
  }
}
