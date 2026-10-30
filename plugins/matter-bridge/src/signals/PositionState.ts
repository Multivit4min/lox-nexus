import { StateActuator } from "./StateActuator.ts"

/** Where a blind is, in % closed (0 open, 100 closed). */
export class PositionState extends StateActuator {
  static readonly id = "position"
  static readonly label = "Current position % to controllers"
  static readonly description = "Where the blind is, in % closed (0 open, 100 closed)"
  static readonly accepts = "number"
  protected readonly kind = "position"
}
