import { CommandSensor } from "./CommandSensor.ts"

/** The maximum charging current an app set, in A. */
export class MaxCurrentCommand extends CommandSensor {
  static readonly id = "max-current"
  static readonly label = "Maximum charging current A from controllers"
  static readonly description = "The maximum current an app allowed when it enabled charging, in A (6 A up to the 32 A circuit)"
  static readonly valueType = "number"
  static readonly unit = "A"
  static readonly decimals = 0
  protected readonly kind = "maxCurrent"
}
