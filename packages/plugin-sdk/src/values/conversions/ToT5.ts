import { Value, type ValueOf } from "../Value.ts"
import { Conversion } from "./Conversion.ts"

/** @experimental only numbers map onto the button mask; everything else means "no button". */
export class ToT5 extends Conversion<"t5"> {
  readonly target = "t5"

  protected from(value: Value): ValueOf<"t5"> {
    if (value.type !== "number" || !Number.isInteger(value.value) || value.value < 0 || value.value > 31) return this.fallback()
    return Value.t5({ buttons: value.value })
  }
}
