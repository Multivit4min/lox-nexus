import { StateActuator } from "./StateActuator.ts"

/** A current. */
export class CurrentState extends StateActuator {
  static readonly id = "current"
  static readonly label = "Current A to controllers"
  static readonly description = "The current in A"
  static readonly accepts = "number"
  static readonly unit = "A"
  static readonly decimals = 1
  protected readonly kind = "current"
}
