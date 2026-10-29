import { signalGroup, z } from "@lox-nexus/plugin-sdk"

/** Entity ids as Home Assistant forms them: `<domain>.<object id>`, e.g. `light.kitchen`. */
export class EntityId {
  static readonly pattern = /^[a-z0-9_]+\.[a-z0-9_]+$/

  /** an entity id, unlabelled; refine it, then label it with `meta()` */
  static get schema() {
    return z.string().regex(EntityId.pattern, "an entity id like light.kitchen")
  }

  /** the form label and hint of an entity id field, with an example that fits the capability */
  static meta(example: string) {
    return { title: "Entity ID", description: `The entity's ID as Home Assistant shows it, e.g. ${example}` }
  }

  /**
   * the params of a sensor or actuator that follows one entity, e.g. `paramsFor("cover.living_room")`;
   * signal lists group the signals of one entity
   */
  static paramsFor(example: string) {
    return z.object({ entityId: signalGroup(EntityId.schema.meta(EntityId.meta(example))) })
  }

  static domain(entityId: string) {
    return entityId.slice(0, entityId.indexOf("."))
  }
}
