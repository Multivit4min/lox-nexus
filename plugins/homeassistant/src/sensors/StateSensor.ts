import { z } from "@lox-nexus/plugin-sdk"
import { EntityId } from "../entities/EntityId.ts"
import type { EntityState } from "../entities/EntityStore.ts"
import { StateValue } from "../entities/StateValue.ts"
import { EntitySensor } from "./EntitySensor.ts"

const params = EntityId.paramsFor("sensor.outdoor_temperature").extend({
  attribute: z.string().min(1).optional().meta({
    title: "Attribute",
    description: "Attribute to read instead of the state, e.g. current_temperature. Leave empty to read the state"
  })
})

/**
 * An entity's state, or one of its attributes. States become numbers, booleans (on/off) or
 * strings (see StateValue); "unavailable" and "unknown" send nothing, so the last value stays.
 */
export class StateSensor extends EntitySensor<z.infer<typeof params>> {
  static readonly id = "state"
  static readonly label = "State or attribute"
  static readonly description = "The state of an entity, or one of its attributes"
  static readonly params = params
  static readonly valueType = "any"

  protected update(state: EntityState) {
    const value = StateValue.of(state, this.params.attribute)
    if (value) this.emit(value)
  }
}
