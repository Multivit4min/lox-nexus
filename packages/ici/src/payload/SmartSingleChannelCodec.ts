import { DataType } from "../DataType.ts"
import { FadeTime } from "./FadeTime.ts"
import { PayloadCodec } from "./PayloadCodec.ts"
import type { SingleChannelValue } from "./values.ts"

/**
 * Channel (0–100) at byte 3, fade time at 4–5. Bytes 0–2 and 6–7 are unknown and written as 0.
 * @experimental the layout comes from the old library; decoding discards the unknown bytes.
 */
export class SmartSingleChannelCodec extends PayloadCodec<SingleChannelValue> {
  readonly dataType = DataType.SmartSingleChannel
  readonly name = "singleChannel"
  readonly size = 8

  decode(payload: Buffer): SingleChannelValue {
    this.requireSize(payload)
    return { channel: payload.readUint8(3), fadeTime: FadeTime.read(payload, 4) }
  }

  encode(value: SingleChannelValue) {
    this.requireType(value, "object")
    this.requireInteger("channel", value.channel, 0, 100)
    const buffer = Buffer.alloc(this.size)
    buffer.writeUint8(value.channel, 3)
    FadeTime.write(buffer, 4, value.fadeTime)
    return buffer
  }
}
