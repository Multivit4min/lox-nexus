import { DataType, type ValueMap } from "@lox-nexus/ici"
import { Converter, Value, type ValueType } from "@lox-nexus/plugin-sdk/values"

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

  /** a decoded ICI value as bus value; undefined for unknown data types */
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
