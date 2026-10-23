import { Value, type ValueOf, type ValueType } from "./Value.ts"

/** The value each type falls back to when a conversion isn't possible. Fade times default to 0.2 s. */
export class ValueDefaults {
  static readonly FADE_TIME = 0.2
  static readonly TEMPERATURE = 4000

  static for<T extends ValueType>(type: T): ValueOf<T> {
    return ValueDefaults.create(type) as ValueOf<T>
  }

  private static create(type: ValueType): Value {
    switch (type) {
      case "null": return Value.null()
      case "boolean": return Value.boolean(false)
      case "number": return Value.number(0)
      case "string": return Value.string("")
      case "singleChannel": return Value.singleChannel({ channel: 0, fadeTime: ValueDefaults.FADE_TIME })
      case "rgbw": return Value.rgbw({ red: 0, green: 0, blue: 0, white: 0, fadeTime: ValueDefaults.FADE_TIME, flags: 0 })
      case "tunableWhite": return Value.tunableWhite({ temperature: ValueDefaults.TEMPERATURE, brightness: 0, fadeTime: ValueDefaults.FADE_TIME })
      case "t5": return Value.t5({ buttons: 0 })
    }
  }
}
