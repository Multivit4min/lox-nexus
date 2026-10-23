import { Value, type ValueOf } from "../Value.ts"
import { Conversion } from "./Conversion.ts"

/** Always yields null, whatever the input. */
export class ToNull extends Conversion<"null"> {
  readonly target = "null"

  protected from(): ValueOf<"null"> {
    return Value.null()
  }
}
