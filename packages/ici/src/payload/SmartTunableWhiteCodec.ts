import { DataType } from "../DataType.ts"
import { FadeTime } from "./FadeTime.ts"
import { PayloadCodec } from "./PayloadCodec.ts"
import type { TunableWhiteValue } from "./values.ts"

/**
 * Temperature (K) at bytes 0–1, brightness (%) at 2–3, fade time at 4–5 in 0.1 s.
 * @experimental bytes 6–7 are a constant 0x0800 from the Miniserver with unknown meaning; they are
 * written as 0 and discarded on decoding.
 */
export class SmartTunableWhiteCodec extends PayloadCodec<TunableWhiteValue> {
  readonly dataType = DataType.SmartTunableWhite
  readonly name = "tunableWhite"
  readonly size = 8

  decode(payload: Buffer): TunableWhiteValue {
    this.requireSize(payload)
    return {
      temperature: payload.readUint16LE(0),
      brightness: payload.readUint16LE(2),
      fadeTime: FadeTime.read(payload, 4)
    }
  }

  encode(value: TunableWhiteValue) {
    this.requireType(value, "object")
    this.requireInteger("temperature", value.temperature, 0, 0xffff)
    this.requireInteger("brightness", value.brightness, 0, 100)
    const buffer = Buffer.alloc(this.size)
    buffer.writeUint16LE(value.temperature, 0)
    buffer.writeUint16LE(value.brightness, 2)
    FadeTime.write(buffer, 4, value.fadeTime)
    return buffer
  }
}
