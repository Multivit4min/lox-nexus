import { CctEstimator } from "../CctEstimator.ts"
import { Numbers } from "../Numbers.ts"
import { StringToNumber } from "../StringToNumber.ts"
import { Value, type ValueOf } from "../Value.ts"
import { ValueDefaults } from "../ValueDefaults.ts"
import { Conversion } from "./Conversion.ts"

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

  private create(brightness: number, fadeTime = ValueDefaults.FADE_TIME, temperature = ValueDefaults.TEMPERATURE) {
    return Value.tunableWhite({
      temperature: Math.round(Numbers.clamp(temperature, 2700, 6500, ValueDefaults.TEMPERATURE)),
      brightness: Numbers.percent(brightness),
      fadeTime: Numbers.clamp(fadeTime, 0, Infinity, ValueDefaults.FADE_TIME)
    })
  }
}
