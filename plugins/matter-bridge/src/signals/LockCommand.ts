import { CommandSensor } from "./CommandSensor.ts"

/** A lock request from a controller: true to lock, false to unlock (only where unlocking is allowed). */
export class LockCommand extends CommandSensor {
  static readonly id = "lock"
  static readonly label = "Lock request from controllers"
  static readonly description = "On (true) when a controller asks to lock, off (false) to unlock; unlocking only where the device allows it"
  static readonly valueType = "boolean"
  protected readonly kind = "lock"
}
