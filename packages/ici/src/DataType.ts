/** Data type byte at offset 37 of a 0x9E data packet (see PROTOCOL.md). */
export const DataType = {
  Digital: 0x00,
  Analog: 0x01,
  Text: 0x02,
  T5: 0x03,
  SmartRgbw: 0x04,
  SmartSingleChannel: 0x05,
  SmartTunableWhite: 0x06
} as const

export type DataType = (typeof DataType)[keyof typeof DataType]
