import { DataType } from "../DataType.ts"
import { AnalogCodec } from "./AnalogCodec.ts"
import { DigitalCodec } from "./DigitalCodec.ts"
import type { PayloadCodec } from "./PayloadCodec.ts"
import { SmartRgbwCodec } from "./SmartRgbwCodec.ts"
import { SmartSingleChannelCodec } from "./SmartSingleChannelCodec.ts"
import { SmartTunableWhiteCodec } from "./SmartTunableWhiteCodec.ts"
import { T5Codec } from "./T5Codec.ts"
import { TextCodec } from "./TextCodec.ts"
import type { ValueMap } from "./values.ts"

type CodecTable = { [K in DataType]: PayloadCodec<ValueMap[K]> }

/** Registry of the codec for every known data type. */
export class PayloadCodecs {
  private static readonly table: CodecTable = {
    [DataType.Digital]: new DigitalCodec(),
    [DataType.Analog]: new AnalogCodec(),
    [DataType.Text]: new TextCodec(),
    [DataType.T5]: new T5Codec(),
    [DataType.SmartRgbw]: new SmartRgbwCodec(),
    [DataType.SmartSingleChannel]: new SmartSingleChannelCodec(),
    [DataType.SmartTunableWhite]: new SmartTunableWhiteCodec()
  }

  /** the codec for a known data type; use isKnown() first when the type byte comes off the wire */
  static for<T extends DataType>(type: T): PayloadCodec<ValueMap[T]> {
    return PayloadCodecs.table[type]
  }

  /** type guard for raw data type bytes; false for anything this library cannot decode */
  static isKnown(type: number): type is DataType {
    return Object.hasOwn(PayloadCodecs.table, type)
  }

  /** every codec, for tools such as the lab CLI that enumerate the data types */
  static all(): PayloadCodec<unknown>[] {
    return Object.values(PayloadCodecs.table)
  }
}
