import { Actuator, signalGroup, z } from "@lox-nexus/plugin-sdk"
import type { Value } from "@lox-nexus/plugin-sdk/values"
import { EntityId } from "../entities/EntityId.ts"
import type { HomeAssistantPlugin } from "../HomeAssistantPlugin.ts"

const name = /^[a-z0-9_]+$/
const params = z.object({
  domain: z.string().regex(name, "lowercase letters, digits and _").meta({ title: "Service domain", description: "The service name's part before the dot, e.g. media_player for media_player.volume_set" }),
  service: z.string().regex(name, "lowercase letters, digits and _").meta({ title: "Service", description: "The service name's part after the dot, e.g. volume_set" }),
  entityId: signalGroup(EntityId.schema.optional()).meta({ title: "Target entity", description: "Entity ID the service acts on, e.g. media_player.living_room. Leave empty if the service takes none" }),
  field: z.string().min(1).optional().meta({
    title: "Value goes into field",
    description: "Service data field that receives the value, e.g. volume_level. Without one, the service is called when the value is true (or non-zero)"
  }),
  data: z.record(z.string(), z.unknown()).default({}).meta({ title: "Extra service data", description: "Further service data, sent with every call" })
})

/**
 * Calls any Home Assistant service, for what the other actuators don't cover (media players,
 * notifications, vacuum, …). The value goes into `field`; structured values (RGBW, …) go in as
 * their object. Without a field it acts as a trigger, so a Loxone pulse calls it once.
 */
export class ServiceCallActuator extends Actuator<HomeAssistantPlugin, z.infer<typeof params>> {
  static readonly id = "service"
  static readonly label = "Service call"
  static readonly description = "Calls any Home Assistant service, for what the other actuators don't cover"
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
