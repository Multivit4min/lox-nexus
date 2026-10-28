import type { LoxoneSignalInput } from "@lox-nexus/api"
import type { ValueType } from "@lox-nexus/plugin-sdk/values"

/** an ICI data type byte as the API accepts it */
export type DataTypeId = LoxoneSignalInput["dataType"]

/** Names of the ICI data type bytes, for selects and tables. Mirrors DataType in packages/ici (which the UI must not import). */
export class DataTypes {
  static readonly ALL = [
    { id: 0, name: "Digital" },
    { id: 1, name: "Analog" },
    { id: 2, name: "Text" },
    { id: 3, name: "T5" },
    { id: 4, name: "Smart RGBW" },
    { id: 5, name: "Smart single channel" },
    { id: 6, name: "Smart tunable white" }
  ] as const

  static nameOf(id: number) {
    return DataTypes.ALL.find(type => type.id === id)?.name ?? `unknown (${id})`
  }

  /** a data type byte from a select's value; Analog for anything unknown */
  static idOf(id: number): DataTypeId {
    return DataTypes.ALL.find(type => type.id === id)?.id ?? 1
  }

  /** the data type that carries a bus value type as it is; Analog for signals of any type */
  static forValueType(valueType: ValueType | "any"): DataTypeId {
    const byValueType: Record<ValueType, DataTypeId> = { null: 1, boolean: 0, number: 1, string: 2, t5: 3, rgbw: 4, singleChannel: 5, tunableWhite: 6 }
    return valueType === "any" ? 1 : byValueType[valueType]
  }
}
