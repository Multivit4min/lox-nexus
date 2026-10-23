import { DataType } from "../DataType.ts"

/** Human names for data types, used on the command line and in output. */
export class DataTypeNames {
  private static readonly NAMES = new Map<string, DataType>([
    ["digital", DataType.Digital],
    ["analog", DataType.Analog],
    ["text", DataType.Text],
    ["t5", DataType.T5],
    ["rgbw", DataType.SmartRgbw],
    ["single", DataType.SmartSingleChannel],
    ["tunable", DataType.SmartTunableWhite]
  ])

  static parse(name: string): DataType {
    const type = DataTypeNames.NAMES.get(name.toLowerCase())
    if (type === undefined) throw new Error(`unknown type "${name}", expected one of ${DataTypeNames.list()}`)
    return type
  }

  static nameOf(type: number): string {
    for (const [name, value] of DataTypeNames.NAMES) if (value === type) return name
    return `type-0x${type.toString(16)}`
  }

  static list() {
    return [...DataTypeNames.NAMES.keys()].join(", ")
  }
}
