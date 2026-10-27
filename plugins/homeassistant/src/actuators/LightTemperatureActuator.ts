import type { ValueOf } from "@lox-nexus/plugin-sdk/values"
import type { EntityState } from "../entities/EntityStore.ts"
import { LightState } from "../entities/LightState.ts"
import { EntityActuator } from "./EntityActuator.ts"

/** Sets a light's colour temperature and brightness from tunable white; brightness 0 turns it off. */
export class LightTemperatureActuator extends EntityActuator<ValueOf<"tunableWhite">> {
  static readonly id = "lightTemperature"
  static readonly label = "Light colour temperature"
  static readonly accepts = "tunableWhite"
  static readonly domains = ["light"]
  static readonly concurrency = "latest"

  static supports(entity: EntityState) {
    return new LightState(entity).modes.includes("color_temp")
  }

  async run({ value }: ValueOf<"tunableWhite">) {
    const transition = EntityActuator.transition(value.fadeTime)
    if (value.brightness === 0) await this.call("turn_off", transition)
    else await this.call("turn_on", { color_temp_kelvin: value.temperature, brightness_pct: value.brightness, ...transition })
  }
}
