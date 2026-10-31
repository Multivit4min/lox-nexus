import { StateActuator } from "./StateActuator.ts"

/** A pressure in hPa. */
export class PressureState extends StateActuator {
  static readonly id = "pressure"
  static readonly label = "Pressure hPa to controllers"
  static readonly description = "The pressure in hPa (mbar), e.g. a weather station's air pressure"
  static readonly accepts = "number"
  static readonly unit = "hPa"
  static readonly decimals = 0
  protected readonly kind = "pressure"
}
