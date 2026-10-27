import { z } from "@lox-nexus/plugin-sdk"

/** Entity ids as Home Assistant forms them: `<domain>.<object id>`, e.g. `light.kitchen`. */
export class EntityId {
  static readonly pattern = /^[a-z0-9_]+\.[a-z0-9_]+$/

  /** the params of every sensor and actuator that follows one entity */
  static readonly params = z.object({
    entityId: z.string().regex(EntityId.pattern, "an entity id like light.kitchen").describe("Entity id, e.g. light.kitchen")
  })

  static domain(entityId: string) {
    return entityId.slice(0, entityId.indexOf("."))
  }
}
