import { CctEstimator } from "../CctEstimator.ts"
import { Numbers } from "../Numbers.ts"
import { StringToNumber } from "../StringToNumber.ts"
import { Value, type ValueOf } from "../Value.ts"
import { ValueDefaults } from "../ValueDefaults.ts"
import { Conversion } from "./Conversion.ts"

/**
 * Scalars set the brightness at the default temperature. An rgbw keeps its white as brightness
 * and its fade time, and estimates the temperature from the tint (CctEstimator).
 */
export class ToTunableWhite extends Conversion<"tunableWhite"> {
  readonly target = "tunableWhite"
  private readonly parser = new StringToNumber()
  private readonly cct = new CctEstimator()

  protected from(value: Value): ValueOf<"tunableWhite"> {
    switch (value.type) {
      case "number": return this.create(value.value)
      case "boolean": return this.create(value.value ? 100 : 0)
      case "string": return this.create(this.parser.parse(value.value))
      case "singleChannel": return this.create(value.value.channel, value.value.fadeTime)
      // the old converter spread its factory object here and lost the fade time (old VariableConverter.ts:185)
      case "rgbw": return this.create(value.value.white, value.value.fadeTime, this.cct.fromRgbw(value.value))
      default: return this.fallback()
    }
  }

  // temperature is clamped to the 2700–6500 K range of common tunable white fixtures
  private create(brightness: number, fadeTime = ValueDefaults.FADE_TIME, temperature = ValueDefaults.TEMPERATURE) {
    return Value.tunableWhite({
      temperature: Math.round(Numbers.clamp(temperature, 2700, 6500, ValueDefaults.TEMPERATURE)),
      brightness: Numbers.percent(brightness),
      fadeTime: Numbers.clamp(fadeTime, 0, Infinity, ValueDefaults.FADE_TIME)
    })
  }
}
