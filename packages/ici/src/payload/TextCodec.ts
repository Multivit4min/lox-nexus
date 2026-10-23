import { DataType } from "../DataType.ts"
import { UdpLimits } from "../packet/UdpLimits.ts"
import { PayloadCodec } from "./PayloadCodec.ts"

/** UTF-8, NUL-terminated; the terminator counts towards the payload length. */
export class TextCodec extends PayloadCodec<string> {
  readonly dataType = DataType.Text
  readonly name = "text"
  readonly size = undefined
  /** one byte less than the UDP payload limit, for the terminator */
  static readonly MAX_BYTES = UdpLimits.MAX_DATA_PAYLOAD - 1

  decode(payload: Buffer) {
    const end = payload.indexOf(0)
    return payload.toString("utf8", 0, end < 0 ? payload.length : end)
  }

  encode(value: string) {
    this.requireType(value, "string")
    const text = Buffer.from(value, "utf8")
    if (text.includes(0)) throw new RangeError("text must not contain NUL characters")
    if (text.length > TextCodec.MAX_BYTES) {
      throw new RangeError(`text is ${text.length} bytes, maximum is ${TextCodec.MAX_BYTES}`)
    }
    return Buffer.concat([text, Buffer.from([0])])
  }
}
