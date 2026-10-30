import { StateActuator } from "./StateActuator.ts"

/** A dimmable light's brightness in %; 0 shows it off, anything above on at that brightness. */
export class BrightnessState extends StateActuator {
  static readonly id = "brightness"
  static readonly label = "Brightness % to controllers"
  static readonly description = "The light's brightness (0–100); 0 shows it off, more shows it on at that brightness"
  static readonly accepts = "number"
  static readonly unit = "%"
  static readonly decimals = 0
  protected readonly kind = "brightness"
}
