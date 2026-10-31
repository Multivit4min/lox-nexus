import { StateActuator } from "./StateActuator.ts"

/** Illuminance in lux. */
export class IlluminanceState extends StateActuator {
  static readonly id = "illuminance"
  static readonly label = "Illuminance lx to controllers"
  static readonly description = "The brightness a light sensor measures, in lux"
  static readonly accepts = "number"
  static readonly unit = "lx"
  static readonly decimals = 0
  protected readonly kind = "illuminance"
}
