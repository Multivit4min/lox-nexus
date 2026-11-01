import { z } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { StepParams } from "../params/StepParams.ts"
import { StepSensor } from "./StepSensor.ts"

const params = StepParams.schema(z.boolean().default(true).meta({ title: "Value", description: "On: this step sends true; off: false" }))

/** Sends true or false per step. For on between two times on the same days, a window is simpler. */
export class BooleanValueSensor extends StepSensor<boolean> {
  static readonly id = "value-boolean"
  static readonly label = "On/off by time"
  static readonly description = "Sends true or false from each step's time on"
  static readonly params = params
  static readonly valueType = "boolean"
  readonly kind = "On/off"

  protected toValue(value: boolean) {
    return Value.boolean(value)
  }

  protected format(value: boolean) {
    return value ? "on" : "off"
  }
}
