import { CommandSensor } from "./CommandSensor.ts"

/** Whether an app switched the chime on or off. */
export class ChimeEnabledCommand extends CommandSensor {
  static readonly id = "chime-enabled"
  static readonly label = "Chime on from controllers"
  static readonly description = "true when an app switches the chime on, false when it mutes it"
  static readonly valueType = "boolean"
  protected readonly kind = "chimeEnabled"
}
