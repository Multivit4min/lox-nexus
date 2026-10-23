import { DataType } from "../DataType.ts"
import type { ValueMap } from "../payload/values.ts"

/** Parses --value arguments. Object types take JSON; omitted rgbw flags default to 0. */
export class ValueParser {
  parse<T extends DataType>(type: T, text: string): ValueMap[T] {
    return this.parseAny(type, text) as ValueMap[T]
  }

  private parseAny(type: DataType, text: string): unknown {
    switch (type) {
      case DataType.Digital: return this.boolean(text)
      case DataType.Analog: return this.number(text)
      case DataType.Text: return text
      case DataType.T5: return { buttons: this.number(text) }
      case DataType.SmartRgbw: return { flags: 0, fadeTime: 0.2, ...this.json(text) }
      case DataType.SmartSingleChannel:
      case DataType.SmartTunableWhite: return { fadeTime: 0.2, ...this.json(text) }
    }
  }

  private boolean(text: string) {
    const normalized = text.toLowerCase()
    if (["1", "true", "on"].includes(normalized)) return true
    if (["0", "false", "off"].includes(normalized)) return false
    throw new Error(`"${text}" is not a digital value, use 1/0, true/false or on/off`)
  }

  private number(text: string) {
    const value = Number(text)
    if (!Number.isFinite(value)) throw new Error(`"${text}" is not a number`)
    return value
  }

  private json(text: string): object {
    const value: unknown = JSON.parse(text)
    if (typeof value !== "object" || value === null) throw new Error(`expected a JSON object, got ${text}`)
    return value
  }
}
