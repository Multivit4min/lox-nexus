import type { ValueOf } from "@lox-nexus/plugin-sdk/values"
import type { EntityState } from "../entities/EntityStore.ts"
import { LightState } from "../entities/LightState.ts"
import { EntityActuator } from "./EntityActuator.ts"

/** Dims a light: 0 % turns it off, anything else on at that brightness, fading over the value's fade time. */
export class LightBrightnessActuator extends EntityActuator<ValueOf<"singleChannel">> {
  static readonly id = "lightBrightness"
  static readonly label = "Light brightness"
  static readonly accepts = "singleChannel"
  static readonly domains = ["light"]
  static readonly concurrency = "latest"

  /** lights that can only switch on and off get the on/off actuator instead */
  static supports(entity: EntityState) {
    return new LightState(entity).modes.some(mode => mode !== "onoff")
  }

  async run({ value }: ValueOf<"singleChannel">) {
    const transition = EntityActuator.transition(value.fadeTime)
    if (value.channel === 0) await this.call("turn_off", transition)
    else await this.call("turn_on", { brightness_pct: value.channel, ...transition })
  }
}
