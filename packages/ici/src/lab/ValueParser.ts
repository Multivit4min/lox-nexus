import { DataType } from "../DataType.ts"
import type { ValueMap } from "../payload/values.ts"

/** Parses --value arguments. Object types take JSON; omitted rgbw flags default to 0. */
export class ValueParser {
  parse<T extends DataType>(type: T, text: string): ValueMap[T] {
    return this.parseAny(type, text) as ValueMap[T]
  }

  private parseAny(type: DataType, text: string): unknown {
    switch (type) {
      case DataType.Digital: return ["1", "true", "on"].includes(text.toLowerCase())
      case DataType.Analog: return this.number(text)
      case DataType.Text: return text
      case DataType.T5: return { buttons: this.number(text) }
      case DataType.SmartRgbw: return { flags: 0, fadeTime: 0.2, ...this.json(text) }
      case DataType.SmartSingleChannel:
      case DataType.SmartTunableWhite: return { fadeTime: 0.2, ...this.json(text) }
    }
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
