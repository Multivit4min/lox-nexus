import { CommandSensor } from "./CommandSensor.ts"

/** The slat angle a controller asked for, in % closed: 0 open (horizontal), 100 closed. */
export class TiltCommand extends CommandSensor {
  static readonly id = "tilt"
  static readonly label = "Target slat angle % from controllers"
  static readonly description = "Where a controller wants the slats, in % closed (0 open, 100 closed); stop sends the current angle"
  static readonly valueType = "number"
  static readonly unit = "%"
  static readonly decimals = 0
  protected readonly kind = "tilt"
}
