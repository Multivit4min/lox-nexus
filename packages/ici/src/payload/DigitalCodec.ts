import { DataType } from "../DataType.ts"
import { PayloadCodec } from "./PayloadCodec.ts"

/** DIGITAL: a single byte; any non-zero byte decodes as true, encoding writes exactly 0 or 1. */
export class DigitalCodec extends PayloadCodec<boolean> {
  readonly dataType = DataType.Digital
  readonly name = "digital"
  readonly size = 1

  decode(payload: Buffer) {
    this.requireSize(payload)
    return payload.readUint8(0) !== 0
  }

  encode(value: boolean) {
    this.requireType(value, "boolean")
    return Buffer.from([value ? 1 : 0])
  }
}
