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
 * survive decoding and re-encoding unchanged. Received packets also keep the whole datagram.
 */
export class DataPacket {
  static readonly CONTROL = 0x9e
  static readonly HEADER_SIZE = 38
  /** header bytes that have always been 0 so far (see PROTOCOL.md) */
  static readonly RESERVED_OFFSETS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 16, 25, 34]

  constructor(
    readonly sourceId: string,
    readonly targetId: string,
    readonly packetId: string,
    readonly dataType: number,
    readonly payload: Buffer,
    /** the complete datagram as received; undefined for packets built locally */
    readonly raw?: Buffer
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

  /** @experimental offsets of reserved header bytes that are not 0 in the received datagram */
  reservedNonZero(): number[] {
    const raw = this.raw
    return raw ? DataPacket.RESERVED_OFFSETS.filter(offset => raw[offset] !== 0) : []
  }

  /** @experimental bytes after the announced payload in the received datagram */
  trailing(): Buffer {
    return this.raw ? this.raw.subarray(DataPacket.HEADER_SIZE + this.payload.length) : Buffer.alloc(0)
  }

  /** true if both packets carry the same data type and byte-identical payloads */
  samePayload(other: DataPacket) {
    return this.dataType === other.dataType && this.payload.equals(other.payload)
  }
}
