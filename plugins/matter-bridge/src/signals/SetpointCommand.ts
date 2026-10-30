import { CommandSensor } from "./CommandSensor.ts"

/** The heating setpoint a controller set, in °C. */
export class SetpointCommand extends CommandSensor {
  static readonly id = "setpoint"
  static readonly label = "Heating setpoint °C from controllers"
  static readonly description = "The temperature a controller set on the thermostat, in °C"
  static readonly valueType = "number"
  protected readonly kind = "setpoint"
}
