import { CommandSensor } from "./CommandSensor.ts"

/** The brightness a controller set, 1–100 %, or 0 when it switched the light off. */
export class BrightnessCommand extends CommandSensor {
  static readonly id = "brightness"
  static readonly label = "Brightness % from controllers"
  static readonly description = "The brightness a controller set (1–100), 0 when it switched the light off"
  static readonly valueType = "number"
  protected readonly kind = "brightness"
}
