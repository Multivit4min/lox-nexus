import { z } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { StepParams } from "../params/StepParams.ts"
import { StepSensor } from "./StepSensor.ts"

const params = StepParams.schema(z.number().meta({ title: "Value", description: "The number this step sends, e.g. 21.5" }))

/** Sends a number per step, e.g. a heating setpoint: 21 from 06:00, 18 from 22:00. */
export class NumberValueSensor extends StepSensor<number> {
  static readonly id = "value-number"
  static readonly label = "Number by time"
  static readonly description = "Sends a number from each step's time on, e.g. 21 from 06:00 and 18 from 22:00"
  static readonly params = params
  static readonly valueType = "number"
  readonly kind = "Number"

  protected toValue(value: number) {
    return Value.number(value)
  }

  protected format(value: number) {
    return String(value)
  }
}
