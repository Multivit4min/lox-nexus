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

/**
 * Converts values between types. Never throws: impossible conversions yield the target's default
 * (see ValueDefaults). Wires rely on this so a bad value from a plugin cannot stall the bus.
 *
 * Wires and actuators use it to turn what they receive into the type a signal declares
 * (`accepts`, `valueType`), so a plugin can call it too to predict the result. The rules, by
 * target type:
 * - boolean: a number is true when non-zero; a string is true for "on"-like words ("on", "true",
 *   "open", "active", ...); a structured value is true when anything is lit or pressed
 * - number: a boolean is 0 or 1; a string is parsed leniently ("20%" gives 0.2, "1.234,5" gives
 *   1234.5, unparseable gives 0); single channel gives its channel, tunable white its brightness,
 *   RGBW its colour packed as 0xRRGGBBWW (kept from the old converter), t5 its button mask
 * - string: a readable rendering ("42", "true", "50% 0.2s", "#ff000000 0.2s")
 * - singleChannel, rgbw, tunableWhite: a number is a percentage (0-100) of the light's
 *   brightness or white channel; a boolean is 0 or 100; fade times default to 0.2 s
 * - t5: only whole numbers 0-31 convert; everything else means "no button"
 * - null: always null
 */
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

  /**
   * Converts `value` to the type `to`.
   * @returns the converted value; one that already has the target type is returned as is (same
   *   object), without validation
   */
  static convert<T extends ValueType>(value: Value, to: T): ValueOf<T> {
    return Converter.conversions[to].convert(value)
  }
}
