import { CommandSensor } from "./CommandSensor.ts"

/** The charging mode an app picked: manual, time of use or solar. */
export class ChargingModeCommand extends CommandSensor {
  static readonly id = "charging-mode"
  static readonly label = "Charging mode from controllers"
  static readonly description = "The charging mode an app picked: manual, time-of-use or solar"
  static readonly valueType = "string"
  protected readonly kind = "chargingMode"
}
