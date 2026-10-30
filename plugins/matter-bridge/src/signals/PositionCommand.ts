import { CommandSensor } from "./CommandSensor.ts"

/** The position a controller asked for, in % closed: 0 open, 100 closed. */
export class PositionCommand extends CommandSensor {
  static readonly id = "position"
  static readonly label = "Target position % from controllers"
  static readonly description = "Where a controller wants the blind, in % closed (0 open, 100 closed); stop sends the current position"
  static readonly valueType = "number"
  protected readonly kind = "position"
}
