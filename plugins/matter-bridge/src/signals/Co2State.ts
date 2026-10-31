import { StateActuator } from "./StateActuator.ts"

/** CO₂ in ppm. */
export class Co2State extends StateActuator {
  static readonly id = "co2"
  static readonly label = "CO₂ ppm to controllers"
  static readonly description = "The carbon dioxide concentration in ppm, e.g. from a Loxone room climate sensor"
  static readonly accepts = "number"
  static readonly unit = "ppm"
  static readonly decimals = 0
  protected readonly kind = "co2"
}
