import { Numbers } from "../Numbers.ts"
import { T5Buttons } from "../T5Buttons.ts"
import { Value, type ValueOf } from "../Value.ts"
import { Conversion } from "./Conversion.ts"

export class ToString extends Conversion<"string"> {
  readonly target = "string"

  protected from(value: Value): ValueOf<"string"> {
    switch (value.type) {
      case "boolean": return Value.string(String(value.value))
      // the old converter rounded numbers to 5 decimals, so 0.1 + 0.2 reads "0.3"
      case "number": return Value.string(String(Math.round(value.value * 1e5) / 1e5))
      case "singleChannel": return Value.string(`${value.value.channel}% ${value.value.fadeTime}s`)
      case "rgbw": {
        const { red, green, blue, white, fadeTime } = value.value
        return Value.string(`#${[red, green, blue, white].map(Numbers.percentToHex).join("")} ${fadeTime}s`)
      }
      case "tunableWhite": {
        const { temperature, brightness, fadeTime } = value.value
        return Value.string(`${temperature}K ${brightness}% ${fadeTime}s`)
      }
      case "t5": return Value.string(new T5Buttons(value.value.buttons).toString())
      default: return this.fallback()
    }
  }
}
