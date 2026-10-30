import { StateActuator } from "./StateActuator.ts"

/** A tunable white light's colour temperature in Kelvin, shown to controllers. */
export class ColorTemperatureState extends StateActuator {
  static readonly id = "color-temperature"
  static readonly label = "Colour temperature K to controllers"
  static readonly description = "The light's colour temperature in Kelvin, limited to 2700–6500"
  static readonly accepts = "number"
  static readonly unit = "K"
  static readonly decimals = 0
  protected readonly kind = "colorTemperature"
}
