import { Actuator, z } from "@lox-nexus/plugin-sdk"
import type { Value } from "@lox-nexus/plugin-sdk/values"
import { EntityId } from "../entities/EntityId.ts"
import type { HomeAssistantPlugin } from "../HomeAssistantPlugin.ts"

const name = /^[a-z0-9_]+$/
const params = z.object({
  domain: z.string().regex(name, "lowercase letters, digits and _").describe("Service domain, e.g. media_player"),
  service: z.string().regex(name, "lowercase letters, digits and _").describe("Service, e.g. volume_set"),
  entityId: z.string().regex(EntityId.pattern, "an entity id like light.kitchen").optional().describe("Target entity, if the service takes one"),
  field: z.string().min(1).optional()
    .describe("Service data field that receives the value, e.g. volume_level. Without one, the service is called when the value is true (or non-zero)"),
  data: z.record(z.string(), z.unknown()).default({}).describe("Further service data, sent with every call")
})

/**
 * Calls any Home Assistant service, for what the other actuators don't cover (media players,
 * notifications, vacuum, …). The value goes into `field`; structured values (RGBW, …) go in as
 * their object. Without a field it acts as a trigger, so a Loxone pulse calls it once.
 */
export class ServiceCallActuator extends Actuator<HomeAssistantPlugin, z.infer<typeof params>> {
  static readonly id = "service"
  static readonly label = "Service call"
  static readonly params = params
  static readonly accepts = "any"

  async run(value: Value) {
    const { domain, service, entityId, field, data } = this.params
    if (field === undefined && !ServiceCallActuator.isTrue(value)) return
    const payload = field === undefined ? data : { ...data, [field]: ServiceCallActuator.json(value) }
    await this.plugin.connection.callService(domain, service, payload, entityId)
  }

  private static json(value: Value) {
    return value.type === "null" ? null : value.value
  }

  private static isTrue(value: Value) {
    if (value.type === "boolean") return value.value
    if (value.type === "string") return value.value !== ""
    return value.type === "number" && value.value !== 0
  }
}
