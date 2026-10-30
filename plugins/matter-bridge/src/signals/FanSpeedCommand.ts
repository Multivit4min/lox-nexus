import { CommandSensor } from "./CommandSensor.ts"

/** The speed a controller set on a fan, 0–100 % (off, low, medium and high become 0, 33, 66 and 100). */
export class FanSpeedCommand extends CommandSensor {
  static readonly id = "fan-speed"
  static readonly label = "Fan speed % from controllers"
  static readonly description = "The speed a controller set (0–100); off, low, medium and high become 0, 33, 66 and 100"
  static readonly valueType = "number"
  static readonly unit = "%"
  static readonly decimals = 0
  protected readonly kind = "fanSpeed"
}
