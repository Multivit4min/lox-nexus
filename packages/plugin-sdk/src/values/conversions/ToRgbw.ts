import { Numbers } from "../Numbers.ts"
import { StringToNumber } from "../StringToNumber.ts"
import { Value, type ValueOf } from "../Value.ts"
import { ValueDefaults } from "../ValueDefaults.ts"
import { Conversion } from "./Conversion.ts"

/**
 * Scalars drive the white channel, like the old converter did. Colour information of other
 * types is dropped (a tunableWhite's temperature is not turned into a tint).
 */
export class ToRgbw extends Conversion<"rgbw"> {
  readonly target = "rgbw"
  private readonly parser = new StringToNumber()

  protected from(value: Value): ValueOf<"rgbw"> {
    switch (value.type) {
      case "number": return this.white(value.value)
      case "boolean": return this.white(value.value ? 100 : 0)
      case "string": return this.white(this.parser.parse(value.value))
      case "singleChannel": return this.white(value.value.channel, value.value.fadeTime)
      case "tunableWhite": return this.white(value.value.brightness, value.value.fadeTime)
      default: return this.fallback()
    }
  }

  private white(white: number, fadeTime = ValueDefaults.FADE_TIME) {
    const fade = Numbers.clamp(fadeTime, 0, Infinity, ValueDefaults.FADE_TIME)
    return Value.rgbw({ red: 0, green: 0, blue: 0, white: Numbers.percent(white), fadeTime: fade, flags: 0 })
  }
}
