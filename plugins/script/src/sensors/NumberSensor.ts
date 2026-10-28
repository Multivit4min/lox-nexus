import { VariableSensor } from "./VariableSensor.ts"

/** A number the script sends with `nexus.set`. */
export class NumberSensor extends VariableSensor {
  static readonly id = "number"
  static readonly label = "Number"
  static readonly valueType = "number"
  protected readonly type = "number"
}
