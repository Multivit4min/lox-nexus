import { StateActuator } from "./StateActuator.ts"

/** Whether a door lock is locked, shown to controllers. */
export class LockedState extends StateActuator {
  static readonly id = "locked"
  static readonly label = "Locked to controllers"
  static readonly description = "On (true) while the lock is locked, off while it is unlocked"
  static readonly accepts = "boolean"
  protected readonly kind = "locked"
}
