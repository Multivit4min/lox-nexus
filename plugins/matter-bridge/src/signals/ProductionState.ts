import { StateActuator } from "./StateActuator.ts"

/** The power a PV system produces. */
export class ProductionState extends StateActuator {
  static readonly id = "production"
  static readonly label = "PV power W to controllers"
  static readonly description = "The power a PV system produces in W (positive); Matter shows it as power fed in"
  static readonly accepts = "number"
  static readonly unit = "W"
  static readonly decimals = 0
  protected readonly kind = "production"
}
