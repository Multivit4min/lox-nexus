import type { ValueOf } from "@lox-nexus/plugin-sdk/values"
import type { EntityState } from "../entities/EntityStore.ts"
import { EntityActuator } from "./EntityActuator.ts"

/** ClimateEntityFeature and WaterHeaterEntityFeature TARGET_TEMPERATURE share the bit */
const TARGET_TEMPERATURE = 1

/**
 * Sets the target temperature of a thermostat or water heater, in the unit Home Assistant uses.
 * Thermostats with only a low/high range (heat_cool) aren't offered: they need two values.
 */
export class TemperatureActuator extends EntityActuator<ValueOf<"number">> {
  static readonly id = "temperature"
  static readonly label = "Target temperature"
  static readonly accepts = "number"
  static readonly domains = ["climate", "water_heater"]
  static readonly concurrency = "latest"

  static supports(entity: EntityState) {
    return EntityActuator.hasFeatures(entity, TARGET_TEMPERATURE)
  }

  async run({ value }: ValueOf<"number">) {
    await this.call("set_temperature", { temperature: value })
  }
}
