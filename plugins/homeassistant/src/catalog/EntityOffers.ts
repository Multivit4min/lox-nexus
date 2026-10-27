import type { CatalogEntry } from "@lox-nexus/plugin-sdk"
import { Actuators } from "../actuators/Actuators.ts"
import { OnOffActuator } from "../actuators/OnOffActuator.ts"
import { EntityId } from "../entities/EntityId.ts"
import type { EntityState } from "../entities/EntityStore.ts"
import { LightState } from "../entities/LightState.ts"
import { StateValue } from "../entities/StateValue.ts"
import { Value } from "@lox-nexus/plugin-sdk/values"

/** attributes that describe the entity rather than measure something */
const DESCRIPTIVE = new Set([
  "friendly_name", "icon", "entity_picture", "supported_features", "attribution", "assumed_state", "restored",
  "editable", "device_class", "state_class", "unit_of_measurement", "id", "mode", "step"
])

/** What the catalog offers for one entity: its state, readable attributes, light values and fitting actuators. */
export class EntityOffers {
  constructor(private readonly entityId: string, private readonly entity: EntityState) {}

  get name() {
    const name = this.entity.attributes.friendly_name
    return typeof name === "string" && name !== "" ? name : this.entityId
  }

  entries(): CatalogEntry[] {
    return [...this.sensors(), ...this.actuators()]
  }

  private sensors(): CatalogEntry[] {
    const entityId = this.entityId
    const entries: CatalogEntry[] = [{ kind: "sensor", capability: "state", params: { entityId }, label: `${this.name} state`, ...StateValue.current(this.entity) }]
    for (const [attribute, raw] of Object.entries(this.entity.attributes)) {
      const value = DESCRIPTIVE.has(attribute) ? undefined : StateValue.fromAttribute(raw)
      if (value) entries.push({ kind: "sensor", capability: "state", params: { entityId, attribute }, label: `${this.name} ${attribute}`, value })
    }
    if (EntityId.domain(entityId) === "light") entries.push(...this.lightSensors())
    return entries
  }

  private lightSensors(): CatalogEntry[] {
    const entityId = this.entityId
    const light = new LightState(this.entity)
    const known = !StateValue.MISSING.has(this.entity.state)
    const brightness = known ? { value: Value.singleChannel({ channel: light.brightness, fadeTime: 0 }) } : {}
    const entries: CatalogEntry[] = [{ kind: "sensor", capability: "light", params: { entityId, part: "brightness" }, label: `${this.name} light brightness`, ...brightness }]
    if (!light.modes.some(mode => !["onoff", "brightness"].includes(mode))) return entries
    const color = known ? light.color() : undefined
    entries.push({ kind: "sensor", capability: "light", params: { entityId, part: "color" }, label: `${this.name} light colour`, ...(color ? { value: color } : {}) })
    return entries
  }

  private actuators(): CatalogEntry[] {
    const domain = EntityId.domain(this.entityId)
    return Actuators.forEntities
      .filter(type => type.domains.includes(domain) && (type.supports?.(this.entity, domain) ?? true))
      .map(type => ({
        kind: "actuator", capability: type.id, params: { entityId: this.entityId },
        label: `${this.name} ${this.label(type.id, type.label, domain)}`, ...type.current?.(this.entity)
      }))
  }

  /** on/off says what true and false do, e.g. "open/close" for a cover */
  private label(id: string, label: string, domain: string) {
    if (id !== OnOffActuator.id) return label.toLowerCase()
    return OnOffActuator.services(domain).map(service => service.replace(/^turn_|_cover$|_valve$/g, "")).join("/")
  }
}
