import { CommandSensor } from "./CommandSensor.ts"

/** The cooling setpoint a controller set, in °C. */
export class CoolingSetpointCommand extends CommandSensor {
  static readonly id = "cooling-setpoint"
  static readonly label = "Cooling setpoint °C from controllers"
  static readonly description = "The temperature an app set to cool to; in auto mode an app may move it along with the heating setpoint"
  static readonly valueType = "number"
  static readonly unit = "°C"
  static readonly decimals = 1
  protected readonly kind = "coolingSetpoint"
}
