import { Numbers } from "../Numbers.ts"
import { StringToNumber } from "../StringToNumber.ts"
import { Value, type ValueOf } from "../Value.ts"
import { Conversion } from "./Conversion.ts"

export class ToNumber extends Conversion<"number"> {
  readonly target = "number"
  private readonly parser = new StringToNumber()

  protected from(value: Value): ValueOf<"number"> {
    switch (value.type) {
      case "boolean": return Value.number(value.value ? 1 : 0)
      case "string": return Value.number(this.parser.parse(value.value))
      case "singleChannel": return Value.number(value.value.channel)
      case "rgbw": {
        // kept from the old converter: the colour packed as 0xRRGGBBWW
        const { red, green, blue, white } = value.value
        return Value.number(parseInt([red, green, blue, white].map(Numbers.percentToHex).join(""), 16))
      }
      case "tunableWhite": return Value.number(value.value.brightness)
      case "t5": return Value.number(value.value.buttons)
      default: return this.fallback()
    }
  }
}
