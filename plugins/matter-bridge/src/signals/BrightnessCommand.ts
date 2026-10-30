import { CommandSensor } from "./CommandSensor.ts"

/** The brightness a controller set, 1–100 %, or 0 when it switched the light off. */
export class BrightnessCommand extends CommandSensor {
  static readonly id = "brightness"
  static readonly label = "Brightness % from controllers"
  static readonly description = "The brightness a controller set (1–100), 0 when it switched the light off"
  static readonly valueType = "number"
  static readonly unit = "%"
  static readonly decimals = 0
  protected readonly kind = "brightness"
}
