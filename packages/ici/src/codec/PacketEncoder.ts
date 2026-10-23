import { DataPacket } from "../packet/DataPacket.ts"
import { EncryptedPacket } from "../packet/EncryptedPacket.ts"
import { PacketHeader } from "../packet/PacketHeader.ts"
import { IciId } from "../id/IciId.ts"
import { UdpLimits } from "../packet/UdpLimits.ts"

/** Turns packets into datagrams. Validates ids and lengths instead of truncating. */
export class PacketEncoder {
  /**
   * Builds a plain 0x9E datagram. Reserved header bytes are written as 0, as every capture shows.
   * @throws RangeError for an invalid id (see IciId), a data type outside one byte, or a payload
   *   that would not fit one UDP datagram.
   */
  encodeData(packet: DataPacket): Buffer {
    if (packet.payload.length > UdpLimits.MAX_DATA_PAYLOAD) {
      throw new RangeError(`payload of ${packet.payload.length} bytes exceeds the UDP limit of ${UdpLimits.MAX_DATA_PAYLOAD}`)
    }
    if (!Number.isInteger(packet.dataType) || packet.dataType < 0 || packet.dataType > 0xff) {
      throw new RangeError(`invalid data type ${packet.dataType}`)
    }
    const header = Buffer.alloc(DataPacket.HEADER_SIZE)
    new PacketHeader(DataPacket.CONTROL, packet.sourceId, packet.targetId).write(header)
    IciId.from(packet.packetId).write(header, 26)
    header.writeUint16LE(packet.payload.length, 35)
    header.writeUint8(packet.dataType, 37)
    return Buffer.concat([header, packet.payload])
  }

  /**
   * Builds a 0x9F datagram from an already sealed packet (see IciCipher.seal).
   * @throws RangeError for an IV that is not 16 bytes, ciphertext that is not whole AES blocks,
   *   or more blocks than the one-byte count can announce.
   */
  encodeEncrypted(packet: EncryptedPacket): Buffer {
    const { BODY_OFFSET, BLOCK_SIZE } = EncryptedPacket
    if (packet.iv.length !== BLOCK_SIZE || packet.ciphertext.length % BLOCK_SIZE !== 0) {
      throw new RangeError("encrypted packet needs a 16 byte IV and whole AES blocks")
    }
    if (packet.blockCount > 0xff) throw new RangeError(`too many AES blocks: ${packet.blockCount}`)
    const header = Buffer.alloc(BODY_OFFSET)
    new PacketHeader(EncryptedPacket.CONTROL, packet.sourceId, packet.targetId).write(header)
    header.writeUint8(packet.blockCount, BODY_OFFSET - 1)
    return Buffer.concat([header, packet.iv, packet.ciphertext])
  }
}
