import { CommandSensor } from "./CommandSensor.ts"

/** The colour a controller set, as RGBW with the brightness included. */
export class ColorCommand extends CommandSensor {
  static readonly id = "color"
  static readonly label = "Colour from controllers"
  static readonly description = "The colour an app set, as red, green and blue in % with the brightness included (white 0), for a Loxone RGBW actuator; all 0 when switched off"
  static readonly valueType = "rgbw"
  protected readonly kind = "color"
}
