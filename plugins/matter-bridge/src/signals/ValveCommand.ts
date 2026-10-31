import { CommandSensor } from "./CommandSensor.ts"

/** Open (true) or close (false), as a controller asked. */
export class ValveCommand extends CommandSensor {
  static readonly id = "valve"
  static readonly label = "Open or close from controllers"
  static readonly description = "true when an app opens the valve, false when it closes it"
  static readonly valueType = "boolean"
  protected readonly kind = "valve"
}
