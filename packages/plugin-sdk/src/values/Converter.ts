import type { Conversion } from "./conversions/Conversion.ts"
import { ToBoolean } from "./conversions/ToBoolean.ts"
import { ToNull } from "./conversions/ToNull.ts"
import { ToNumber } from "./conversions/ToNumber.ts"
import { ToRgbw } from "./conversions/ToRgbw.ts"
import { ToSingleChannel } from "./conversions/ToSingleChannel.ts"
import { ToString } from "./conversions/ToString.ts"
import { ToT5 } from "./conversions/ToT5.ts"
import { ToTunableWhite } from "./conversions/ToTunableWhite.ts"
import type { Value, ValueOf, ValueType } from "./Value.ts"

type ConversionTable = { [T in ValueType]: Conversion<T> }

/** Converts values between types. Never throws: impossible conversions yield the target's default. */
export class Converter {
  private static readonly conversions: ConversionTable = {
    null: new ToNull(),
    boolean: new ToBoolean(),
    number: new ToNumber(),
    string: new ToString(),
    singleChannel: new ToSingleChannel(),
    rgbw: new ToRgbw(),
    tunableWhite: new ToTunableWhite(),
    t5: new ToT5()
  }

  static convert<T extends ValueType>(value: Value, to: T): ValueOf<T> {
    return Converter.conversions[to].convert(value)
  }
}
