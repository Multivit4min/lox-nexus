import { z } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { StepParams } from "../params/StepParams.ts"
import { StepSensor } from "./StepSensor.ts"

const params = StepParams.schema(z.string().max(1000).meta({ title: "Text", description: "The text this step sends, e.g. a mode such as \"night\"" }))

/** Sends a text per step, e.g. a mode: "day" from 07:00, "night" from 22:00. */
export class TextValueSensor extends StepSensor<string> {
  static readonly id = "value-text"
  static readonly label = "Text by time"
  static readonly description = "Sends a text from each step's time on, e.g. a mode name"
  static readonly params = params
  static readonly valueType = "string"
  readonly kind = "Text"

  protected toValue(value: string) {
    return Value.string(value)
  }

  protected format(value: string) {
    return JSON.stringify(value)
  }
}
