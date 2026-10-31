import { StateActuator } from "./StateActuator.ts"

/** Whether a car is plugged in. */
export class PluggedInState extends StateActuator {
  static readonly id = "plugged-in"
  static readonly label = "Car plugged in to controllers"
  static readonly description = "On (true) while a car is plugged in; a new plug-in starts a charging session"
  static readonly accepts = "boolean"
  protected readonly kind = "pluggedIn"
}
