import { Actuator } from "@lox-nexus/plugin-sdk"
import type { Value } from "@lox-nexus/plugin-sdk/values"
import { EntityId } from "../entities/EntityId.ts"
import type { EntityState } from "../entities/EntityStore.ts"
import type { HomeAssistantPlugin } from "../HomeAssistantPlugin.ts"

/** The static side every entity actuator declares, read by the catalog and by start(). */
export interface EntityActuatorClass {
  readonly id: string
  readonly label: string
  /** the entity domains it can command */
  readonly domains: readonly string[]
  /** whether this entity supports it, e.g. a cover that can be set to a position; default: every entity of the domains */
  supports?(entity: EntityState, domain: string): boolean
  /** what the entity reports now for what this actuator sets, shown in the catalog; default: nothing */
  current?(entity: EntityState): CurrentValue | undefined
}

/** A value shown next to a catalog entry, with its unit when Home Assistant names one. */
export interface CurrentValue {
  value: Value
  unit?: string
}

/**
 * Commands one entity through Home Assistant services. Adding the signal fails for an entity of
 * another domain; a call while disconnected or one Home Assistant refuses fails the command.
 */
export abstract class EntityActuator<V extends Value> extends Actuator<HomeAssistantPlugin, { entityId: string }, V> {
  static readonly params = EntityId.params

  override start() {
    const type = this.constructor as unknown as EntityActuatorClass
    if (!type.domains.includes(this.domain)) {
      throw new Error(`${type.label} works with ${type.domains.join(", ")} entities, not ${this.domain}`)
    }
  }

  protected get domain() {
    return EntityId.domain(this.params.entityId)
  }

  /** the entity's current state; undefined while disconnected or when it doesn't exist */
  protected get entity() {
    return this.plugin.entities.get(this.params.entityId)
  }

  protected call(service: string, data: Record<string, unknown> = {}, domain = this.domain) {
    return this.plugin.connection.callService(domain, service, data, this.params.entityId)
  }

  /** Home Assistant's transition for a Loxone fade time; omitted for 0 (jump), which not every light accepts */
  protected static transition(fadeTime: number): Record<string, unknown> {
    return fadeTime > 0 ? { transition: fadeTime } : {}
  }

  /** `supported_features` test (all of `bits`), for actuators whose services only some entities offer */
  protected static hasFeatures(entity: EntityState, bits: number) {
    const features = entity.attributes.supported_features
    return typeof features === "number" && (features & bits) === bits
  }
}
