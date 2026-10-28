import { VariableSensor } from "./VariableSensor.ts"

/** A boolean the script sends with `nexus.set`. */
export class SwitchSensor extends VariableSensor {
  static readonly id = "switch"
  static readonly label = "Switch"
  static readonly description = "An on/off value the script sends with nexus.set"
  static readonly valueType = "boolean"
  protected readonly type = "boolean"
}
