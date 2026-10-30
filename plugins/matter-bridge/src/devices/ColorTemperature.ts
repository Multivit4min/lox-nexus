/**
 * Colour temperature in Kelvin, as Nexus and Loxone count it, and in mireds (1 000 000 / K), as
 * Matter does. Limited to the 2700–6500 K that Nexus's conversions keep.
 */
export class ColorTemperature {
  static readonly MIN_KELVIN = 2700
  static readonly MAX_KELVIN = 6500
  /** the coolest light, 6500 K */
  static readonly MIN_MIREDS = Math.round(1_000_000 / ColorTemperature.MAX_KELVIN)
  /** the warmest light, 2700 K */
  static readonly MAX_MIREDS = Math.round(1_000_000 / ColorTemperature.MIN_KELVIN)

  static mireds(kelvin: number) {
    const limited = Math.min(ColorTemperature.MAX_KELVIN, Math.max(ColorTemperature.MIN_KELVIN, kelvin))
    return Math.round(1_000_000 / limited)
  }

  /** Kelvin in steps of 10; the limits come back as 2700 and 6500 exactly */
  static kelvin(mireds: number) {
    if (mireds <= ColorTemperature.MIN_MIREDS) return ColorTemperature.MAX_KELVIN
    if (mireds >= ColorTemperature.MAX_MIREDS) return ColorTemperature.MIN_KELVIN
    return Math.round(1_000_000 / mireds / 10) * 10
  }
}
