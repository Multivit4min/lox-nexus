import { StateActuator } from "./StateActuator.ts"

/** The maximum charging current. */
export class MaxCurrentState extends StateActuator {
  static readonly id = "max-current"
  static readonly label = "Maximum charging current A to controllers"
  static readonly description = "The current the wallbox may charge with, in A (6–32 A)"
  static readonly accepts = "number"
  static readonly unit = "A"
  static readonly decimals = 0
  protected readonly kind = "maxCurrent"
}
