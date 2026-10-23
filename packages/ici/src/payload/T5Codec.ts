import { DataType } from "../DataType.ts"
import { PayloadCodec } from "./PayloadCodec.ts"
import type { T5Value } from "./values.ts"

/**
 * @experimental Assumes a Float64 LE holding the button bitmask. The old library's button codes
 * (16368, 16384, …) are exactly the high bytes of the doubles 1, 2, 4, 8, 16. See PROTOCOL.md.
 */
export class T5Codec extends PayloadCodec<T5Value> {
  readonly dataType = DataType.T5
  readonly name = "t5"
  readonly size = 8

  decode(payload: Buffer): T5Value {
    this.requireSize(payload)
    // not validated as 0–31 on decode: an unexpected value is more useful to see than to throw on
    return { buttons: payload.readDoubleLE(0) }
  }

  encode(value: T5Value) {
    this.requireType(value, "object")
    this.requireInteger("buttons", value.buttons, 0, 0b11111)
    const buffer = Buffer.alloc(this.size)
    buffer.writeDoubleLE(value.buttons)
    return buffer
  }
}
