import { CommandSensor } from "./CommandSensor.ts"

/** The colour temperature a controller set on a tunable white light, in Kelvin. */
export class ColorTemperatureCommand extends CommandSensor {
  static readonly id = "color-temperature"
  static readonly label = "Colour temperature K from controllers"
  static readonly description = "The colour temperature a controller set, in Kelvin (2700 warm to 6500 cold)"
  static readonly valueType = "number"
  static readonly unit = "K"
  static readonly decimals = 0
  protected readonly kind = "colorTemperature"
}
