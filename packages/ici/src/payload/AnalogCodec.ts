import { DataType } from "../DataType.ts"
import { PayloadCodec } from "./PayloadCodec.ts"

export class AnalogCodec extends PayloadCodec<number> {
  readonly dataType = DataType.Analog
  readonly name = "analog"
  readonly size = 8

  decode(payload: Buffer) {
    this.requireSize(payload)
    return payload.readDoubleLE(0)
  }

  encode(value: number) {
    this.requireType(value, "number")
    if (!Number.isFinite(value)) throw new RangeError(`analog value must be finite, got ${value}`)
    const buffer = Buffer.alloc(this.size)
    buffer.writeDoubleLE(value)
    return buffer
  }
}
