import { StateActuator } from "./StateActuator.ts"

/** A colour light's colour, as RGBW with the brightness included. */
export class ColorState extends StateActuator {
  static readonly id = "color"
  static readonly label = "Colour to controllers"
  static readonly description = "The light's colour, e.g. from a Loxone RGBW actuator: red, green and blue in % with the brightness included; white alone is white at that brightness, all 0 shows the light off and keeps its colour"
  static readonly accepts = "rgbw"
  protected readonly kind = "color"
}
