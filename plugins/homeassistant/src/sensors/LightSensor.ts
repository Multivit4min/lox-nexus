import { z } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { EntityId } from "../entities/EntityId.ts"
import type { EntityState } from "../entities/EntityStore.ts"
import { LightState } from "../entities/LightState.ts"
import { StateValue } from "../entities/StateValue.ts"
import { EntitySensor } from "./EntitySensor.ts"

const params = EntityId.params.extend({
  entityId: EntityId.params.shape.entityId.refine(id => EntityId.domain(id) === "light", "a light entity, e.g. light.kitchen"),
  part: z.enum(["brightness", "color"]).default("brightness")
    .describe("brightness: a dimmer value (0–100 %); color: RGBW, or a colour temperature while the light is in that mode")
})

/**
 * A light as a Loxone Smart Actuator value: its brightness as single channel, or its colour as
 * RGBW or tunable white, depending on the light's current colour mode. Off sends brightness 0
 * in the shape last sent, so a tunable-white light switched off stays tunable white.
 */
export class LightSensor extends EntitySensor<z.infer<typeof params>> {
  static readonly id = "light"
  static readonly label = "Light"
  static readonly description = "A light's brightness or colour, as a Loxone smart actuator value"
  static readonly params = params
  static readonly valueType = "any"
  private last: Value | undefined

  protected update(entity: EntityState) {
    if (StateValue.MISSING.has(entity.state)) return
    const light = new LightState(entity)
    if (this.params.part === "brightness") return this.emit(Value.singleChannel({ channel: light.brightness, fadeTime: 0 }))
    const value = light.color() ?? this.off()
    this.last = value
    this.emit(value)
  }

  private off() {
    return this.last?.type === "tunableWhite"
      ? Value.tunableWhite({ ...this.last.value, brightness: 0 })
      : Value.rgbw({ red: 0, green: 0, blue: 0, white: 0, fadeTime: 0, flags: 0 })
  }
}
