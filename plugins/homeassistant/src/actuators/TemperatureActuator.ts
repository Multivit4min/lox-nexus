import type { ValueOf } from "@lox-nexus/plugin-sdk/values"
import type { EntityState } from "../entities/EntityStore.ts"
import { EntityId } from "../entities/EntityId.ts"
import { EntityActuator } from "./EntityActuator.ts"
import { StateValue } from "../entities/StateValue.ts"

/** ClimateEntityFeature and WaterHeaterEntityFeature TARGET_TEMPERATURE share the bit */
const TARGET_TEMPERATURE = 1

/**
 * Sets the target temperature of a thermostat or water heater, in the unit Home Assistant uses.
 * Thermostats with only a low/high range (heat_cool) aren't offered: they need two values.
 */
export class TemperatureActuator extends EntityActuator<ValueOf<"number">> {
  static readonly id = "temperature"
  static readonly label = "Target temperature"
  static readonly description = "Sets the target temperature of a thermostat or water heater"
  static readonly accepts = "number"
  static readonly domains = ["climate", "water_heater"]
  static readonly params = EntityId.paramsFor("climate.living_room")
  static readonly concurrency = "latest"

  static supports(entity: EntityState) {
    return EntityActuator.hasFeatures(entity, TARGET_TEMPERATURE)
  }

  /** the target temperature; Home Assistant gives its unit only in the global config */
  static current(entity: EntityState) {
    return StateValue.current(entity, "temperature")
  }

  async run({ value }: ValueOf<"number">) {
    await this.call("set_temperature", { temperature: value })
  }
}
