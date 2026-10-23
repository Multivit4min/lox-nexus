import type { DataType } from "../DataType.ts"
import { PayloadCodecs } from "../payload/PayloadCodecs.ts"
import type { ValueMap } from "../payload/values.ts"

export interface PacketAddress {
  sourceId: string
  targetId: string
  packetId: string
}

/**
 * A 0x9E data packet. The raw payload is always kept, so unknown data types and unconfirmed bytes
 * survive decoding and re-encoding unchanged.
 */
export class DataPacket {
  static readonly CONTROL = 0x9e
  static readonly HEADER_SIZE = 38

  constructor(
    readonly sourceId: string,
    readonly targetId: string,
    readonly packetId: string,
    readonly dataType: number,
    readonly payload: Buffer
  ) {}

  static of<T extends DataType>(address: PacketAddress, type: T, value: ValueMap[T]) {
    const payload = PayloadCodecs.for(type).encode(value)
    return new DataPacket(address.sourceId, address.targetId, address.packetId, type, payload)
  }

  get isKnownType() {
    return PayloadCodecs.isKnown(this.dataType)
  }

  /** decoded value, or undefined for unknown data types; throws RangeError on short payloads */
  value(): unknown {
    return PayloadCodecs.isKnown(this.dataType) ? PayloadCodecs.for(this.dataType).decode(this.payload) : undefined
  }

  /** true if both packets carry the same data type and byte-identical payloads */
  samePayload(other: DataPacket) {
    return this.dataType === other.dataType && this.payload.equals(other.payload)
  }
}
