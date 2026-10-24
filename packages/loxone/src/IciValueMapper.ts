import { DataType, LoxoneColor, type LoxoneColorValue, type ValueMap } from "@lox-nexus/ici"
import { Converter, Value, type ValueType } from "@lox-nexus/plugin-sdk/values"
import type { LoxoneSignalConfig } from "./MiniserverConfig.ts"

/** Translates between ICI payload values and bus values; both use the same field names. */
export class IciValueMapper {
  private static readonly TYPES: Record<DataType, ValueType> = {
    [DataType.Digital]: "boolean",
    [DataType.Analog]: "number",
    [DataType.Text]: "string",
    [DataType.T5]: "t5",
    [DataType.SmartRgbw]: "rgbw",
    [DataType.SmartSingleChannel]: "singleChannel",
    [DataType.SmartTunableWhite]: "tunableWhite"
  }

  /** the bus value type a data type maps to */
  static valueTypeOf(dataType: DataType): ValueType {
    return IciValueMapper.TYPES[dataType]
  }

  /** a Lumitech signal carries a colour temperature or an RGB colour, so its type depends on the value */
  static signalValueType(config: Pick<LoxoneSignalConfig, "dataType" | "lumitech">): ValueType | "any" {
    return config.lumitech ? "any" : IciValueMapper.valueTypeOf(config.dataType)
  }

  /** a decoded colour number on the bus: a temperature as tunableWhite, an RGB colour as rgbw (no fade: Lumitech has none) */
  static colorToBus(color: LoxoneColorValue): Value {
    if (color.kind === "temperature") return Value.tunableWhite({ temperature: color.kelvin, brightness: color.brightness, fadeTime: 0 })
    return Value.rgbw({ red: color.red, green: color.green, blue: color.blue, white: 0, fadeTime: 0, flags: 0 })
  }

  /**
   * any bus value as a colour number for a Lumitech output: tunableWhite as a temperature, rgbw
   * and everything else as RGB (white added to each channel). A number is taken as a colour number
   * as it is (so 50 is red 50 %), never converted.
   * @throws RangeError for a number that isn't a colour number; the send reports it as a problem
   */
  static toLumitech(value: Value): number {
    if (value.type === "number") {
      if (!LoxoneColor.parse(value.value)) throw new RangeError(`${value.value} is not a Loxone colour number (20bbbkkkk or BBBGGGRRR)`)
      return value.value
    }
    if (value.type === "tunableWhite") {
      const kelvin = Math.min(9999, Math.max(1, Math.round(value.value.temperature)))
      const brightness = Math.min(100, Math.max(0, Math.round(value.value.brightness)))
      return LoxoneColor.format({ kind: "temperature", brightness, kelvin })
    }
    const { red, green, blue, white } = Converter.convert(value, "rgbw").value
    const channel = (level: number) => Math.min(100, Math.round(level + white))
    return LoxoneColor.format({ kind: "rgb", red: channel(red), green: channel(green), blue: channel(blue) })
  }

  /**
   * A decoded ICI value as bus value; undefined for unknown data types.
   * The value is trusted to match the data type (IciReceiver decodes it by that type).
   */
  static toBus(dataType: number, value: unknown): Value | undefined {
    switch (dataType) {
      case DataType.Digital: return Value.boolean(value as boolean)
      case DataType.Analog: return Value.number(value as number)
      case DataType.Text: return Value.string(value as string)
      case DataType.T5: return Value.t5(value as ValueMap[typeof DataType.T5])
      case DataType.SmartRgbw: return Value.rgbw(value as ValueMap[typeof DataType.SmartRgbw])
      case DataType.SmartSingleChannel: return Value.singleChannel(value as ValueMap[typeof DataType.SmartSingleChannel])
      case DataType.SmartTunableWhite: return Value.tunableWhite(value as ValueMap[typeof DataType.SmartTunableWhite])
      default: return undefined
    }
  }

  /** any bus value converted to what the given ICI output expects */
  static toIci<T extends DataType>(dataType: T, value: Value): ValueMap[T] {
    // converting to an ICI type never yields null, so `value` is always present
    const converted = Converter.convert(value, IciValueMapper.valueTypeOf(dataType)) as Exclude<Value, { type: "null" }>
    return converted.value as ValueMap[T]
  }
}
