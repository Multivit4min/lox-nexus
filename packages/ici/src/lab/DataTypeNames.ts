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

  /** @throws Error naming the valid choices for an unknown name (case-insensitive) */
  static parse(name: string): DataType {
    const type = DataTypeNames.NAMES.get(name.toLowerCase())
    if (type === undefined) throw new Error(`unknown type "${name}", expected one of ${DataTypeNames.list()}`)
    return type
  }

  /** inverse of parse(); unknown type bytes become `type-0x..` so they still show up in captures */
  static nameOf(type: number): string {
    for (const [name, value] of DataTypeNames.NAMES) if (value === type) return name
    return `type-0x${type.toString(16)}`
  }

  /** comma-separated names for help and error texts */
  static list() {
    return [...DataTypeNames.NAMES.keys()].join(", ")
  }
}
