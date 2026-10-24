import { SmartRgbwCodec } from "./SmartRgbwCodec.ts"

/** A Loxone colour number, decoded: a colour temperature or an RGB colour, all in whole percent. */
export type LoxoneColorValue =
  | { kind: "temperature"; brightness: number; kelvin: number }
  | { kind: "rgb"; red: number; green: number; blue: number }

const TEMPERATURE_BASE = 200_000_000
const MAX_RGB = 100_100_100

/**
 * The number a Lighting Controller's Lumitech or RGB output carries (PROTOCOL.md):
 * `20bbbkkkk` for a colour temperature (brightness bbb %, kkkk Kelvin) and `BBBGGGRRR` for an
 * RGB colour, red in the lowest three digits. Over an Analog intercommunication output it arrives
 * as is; over an RGBW one as the raw bytes of the double, which fromRgbwPayload() recognises.
 */
export class LoxoneColor {
  /** undefined for anything that isn't a colour number (a fraction, a channel over 100, …) */
  static parse(number: number): LoxoneColorValue | undefined {
    if (!Number.isSafeInteger(number) || number < 0) return undefined
    // -0 is an integer ≥ 0 too, but would give channels of -0
    if (number === 0) number = 0
    if (number >= TEMPERATURE_BASE && number < TEMPERATURE_BASE + 10_000_000) {
      const brightness = Math.floor(number / 10_000) % 1000
      const kelvin = number % 10_000
      return brightness <= 100 && kelvin > 0 ? { kind: "temperature", brightness, kelvin } : undefined
    }
    if (number > MAX_RGB) return undefined
    const [red, green, blue] = [number % 1000, Math.floor(number / 1000) % 1000, Math.floor(number / 1_000_000)]
    return red <= 100 && green <= 100 && blue <= 100 ? { kind: "rgb", red, green, blue } : undefined
  }

  /** @throws RangeError for a value outside what the format can carry */
  static format(color: LoxoneColorValue): number {
    const percent = (name: string, value: number) => {
      if (!Number.isInteger(value) || value < 0 || value > 100) throw new RangeError(`${name} must be a whole percent, got ${value}`)
      return value
    }
    if (color.kind === "temperature") {
      if (!Number.isInteger(color.kelvin) || color.kelvin < 1 || color.kelvin > 9999) throw new RangeError(`kelvin must be 1–9999, got ${color.kelvin}`)
      return TEMPERATURE_BASE + percent("brightness", color.brightness) * 10_000 + color.kelvin
    }
    return percent("blue", color.blue) * 1_000_000 + percent("green", color.green) * 1000 + percent("red", color.red)
  }

  /**
   * The colour number inside an RGBW payload that is really an analog double (a Lumitech output
   * wired to an RGBW intercommunication output). Real RGBW payloads have channels up to 100 and
   * flags 0 or the sequence flag; those, and doubles that aren't colour numbers, give undefined.
   * Two colour numbers look like real payloads and can't be told apart: 0 (all zero, off either
   * way) and 2 (red 2 %, whose double reads as an empty sequence step).
   */
  static fromRgbwPayload(payload: Buffer): LoxoneColorValue | undefined {
    if (payload.length !== 8) return undefined
    const flags = payload.readUInt16LE(6)
    const channels = [0, 1, 2, 3].map(index => payload.readUInt8(index))
    const plausibleRgbw = channels.every(channel => channel <= 100) && (flags === 0 || flags === SmartRgbwCodec.FLAG_SEQUENCE_STEP)
    return plausibleRgbw ? undefined : LoxoneColor.parse(payload.readDoubleLE(0))
  }
}
