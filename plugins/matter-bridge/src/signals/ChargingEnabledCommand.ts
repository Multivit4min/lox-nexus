import { CommandSensor } from "./CommandSensor.ts"

/** Whether an app enabled or disabled charging. */
export class ChargingEnabledCommand extends CommandSensor {
  static readonly id = "charging-enabled"
  static readonly label = "Charging enabled from controllers"
  static readonly description = "true when an app enables charging, false when it disables it"
  static readonly valueType = "boolean"
  protected readonly kind = "chargingEnabled"
}
