import { DataType } from "../DataType.ts"
import { FadeTime } from "./FadeTime.ts"
import { PayloadCodec } from "./PayloadCodec.ts"
import type { RgbwValue } from "./values.ts"

/**
 * R, G, B, W (0–100) at bytes 0–3, fade time at 4–5, flags at 6–7.
 *
 * Channels are whole percent: fractions are rejected on encode, so callers round first.
 * @experimental flags (bytes 6–7) are preserved; only 0x4000 is known, see PROTOCOL.md.
 */
export class SmartRgbwCodec extends PayloadCodec<RgbwValue> {
  readonly dataType = DataType.SmartRgbw
  readonly name = "rgbw"
  readonly size = 8
  /** @experimental bit 14, set by the Lighting Controller on every sequence step (confirmed); how an actuator treats it is not, see PROTOCOL.md */
  static readonly FLAG_SEQUENCE_STEP = 0x4000

  decode(payload: Buffer): RgbwValue {
    this.requireSize(payload)
    return {
      red: payload.readUint8(0),
      green: payload.readUint8(1),
      blue: payload.readUint8(2),
      white: payload.readUint8(3),
      fadeTime: FadeTime.read(payload, 4),
      flags: payload.readUint16LE(6)
    }
  }

  encode(value: RgbwValue) {
    this.requireType(value, "object")
    const buffer = Buffer.alloc(this.size)
    const channels = ["red", "green", "blue", "white"] as const
    channels.forEach((channel, index) => {
      this.requireInteger(channel, value[channel], 0, 100)
      buffer.writeUint8(value[channel], index)
    })
    FadeTime.write(buffer, 4, value.fadeTime)
    this.requireInteger("flags", value.flags, 0, 0xffff)
    buffer.writeUint16LE(value.flags, 6)
    return buffer
  }
}
