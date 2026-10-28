import { VariableSensor } from "./VariableSensor.ts"

/** A string the script sends with `nexus.set`. */
export class TextSensor extends VariableSensor {
  static readonly id = "text"
  static readonly label = "Text"
  static readonly description = "A text the script sends with nexus.set"
  static readonly valueType = "string"
  protected readonly type = "string"
}
