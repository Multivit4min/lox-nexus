import { CommandSensor } from "./CommandSensor.ts"

/** The mode a controller picked: off, heat, cool or auto. */
export class ModeCommand extends CommandSensor {
  static readonly id = "mode"
  static readonly label = "Mode from controllers"
  static readonly description = "The thermostat mode an app picked: off, heat, cool or auto (map it to Loxone's numbers with a Map transform)"
  static readonly valueType = "string"
  protected readonly kind = "mode"
}
