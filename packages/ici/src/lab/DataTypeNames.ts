import { DataType } from "../DataType.ts"

/** Human names for data types, used on the command line and in output. */
export class DataTypeNames {
  private static readonly NAMES: Record<string, DataType> = {
    digital: DataType.Digital,
    analog: DataType.Analog,
    text: DataType.Text,
    t5: DataType.T5,
    rgbw: DataType.SmartRgbw,
    single: DataType.SmartSingleChannel,
    tunable: DataType.SmartTunableWhite
  }

  static parse(name: string): DataType {
    const type = DataTypeNames.NAMES[name.toLowerCase()]
    if (type === undefined) throw new Error(`unknown type "${name}", expected one of ${DataTypeNames.list()}`)
    return type
  }

  static nameOf(type: number): string {
    return Object.entries(DataTypeNames.NAMES).find(([, value]) => value === type)?.[0] ?? `type-0x${type.toString(16)}`
  }

  static list() {
    return Object.keys(DataTypeNames.NAMES).join(", ")
  }
}
