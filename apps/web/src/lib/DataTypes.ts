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
}
