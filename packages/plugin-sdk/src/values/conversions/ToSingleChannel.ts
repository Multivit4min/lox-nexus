import { Numbers } from "../Numbers.ts"
import { StringToNumber } from "../StringToNumber.ts"
import { Value, type ValueOf } from "../Value.ts"
import { ValueDefaults } from "../ValueDefaults.ts"
import { Conversion } from "./Conversion.ts"

/** Scalars are percent. An rgbw becomes the mean of its four channels (rounded down), the average brightness. */
export class ToSingleChannel extends Conversion<"singleChannel"> {
  readonly target = "singleChannel"
  private readonly parser = new StringToNumber()

  protected from(value: Value): ValueOf<"singleChannel"> {
    switch (value.type) {
      case "number": return this.channel(value.value)
      case "boolean": return this.channel(value.value ? 100 : 0)
      case "string": return this.channel(this.parser.parse(value.value))
      case "rgbw": {
        const { red, green, blue, white, fadeTime } = value.value
        return this.channel(Math.floor((red + green + blue + white) / 4), fadeTime)
      }
      case "tunableWhite": return this.channel(value.value.brightness, value.value.fadeTime)
      default: return this.fallback()
    }
  }

  private channel(channel: number, fadeTime = ValueDefaults.FADE_TIME) {
    return Value.singleChannel({ channel: Numbers.percent(channel), fadeTime: Numbers.clamp(fadeTime, 0, Infinity, ValueDefaults.FADE_TIME) })
  }
}
