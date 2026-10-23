import type { DataType } from "../DataType.ts"
import { PayloadCodecs } from "../payload/PayloadCodecs.ts"
import type { ValueMap } from "../payload/values.ts"

/** Who sends a data packet to whom, and which input or output it belongs to (all 1–8 chars). */
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
  /** bytes before the payload: 37 header bytes plus the data type byte at offset 37 */
  static readonly HEADER_SIZE = 38
  /** header bytes that have always been 0 so far (see PROTOCOL.md) */
  static readonly RESERVED_OFFSETS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 16, 25, 34]

  constructor(
    /** the sender's "Own ID" */
    readonly sourceId: string,
    /** the receiver's ID as configured on the sender; receivers must filter on it */
    readonly targetId: string,
    /** identifier of the Loxone input or output this value belongs to */
    readonly packetId: string,
    /** raw data type byte; see DataType for the known values */
    readonly dataType: number,
    /** payload bytes without the header, in wire layout (little-endian) */
    readonly payload: Buffer,
    /** the complete datagram as received; undefined for packets built locally */
    readonly raw?: Buffer
  ) {}

  /**
   * Builds a packet from a typed value, encoding it with the codec for `type`.
   * @throws RangeError if the codec rejects the value (for example a text with a NUL byte)
   */
  static of<T extends DataType>(address: PacketAddress, type: T, value: ValueMap[T]) {
    const payload = PayloadCodecs.for(type).encode(value)
    return new DataPacket(address.sourceId, address.targetId, address.packetId, type, payload)
  }

  /** false for data types we cannot decode; such packets still round-trip byte-exact */
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
