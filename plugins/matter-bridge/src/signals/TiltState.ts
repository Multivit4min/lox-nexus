import { StateActuator } from "./StateActuator.ts"

/** Where a blind's slats are, in % closed (0 open, 100 closed). */
export class TiltState extends StateActuator {
  static readonly id = "tilt"
  static readonly label = "Current slat angle % to controllers"
  static readonly description = "Where the slats are, in % closed (0 open, 100 closed)"
  static readonly accepts = "number"
  static readonly unit = "%"
  static readonly decimals = 0
  protected readonly kind = "tilt"
}
