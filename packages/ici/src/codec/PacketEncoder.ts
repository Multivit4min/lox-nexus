import { DataPacket } from "../packet/DataPacket.ts"
import { EncryptedPacket } from "../packet/EncryptedPacket.ts"
import { PacketHeader } from "../packet/PacketHeader.ts"
import { IciId } from "../id/IciId.ts"

/** Turns packets into datagrams. Validates ids and lengths instead of truncating. */
export class PacketEncoder {
  encodeData(packet: DataPacket): Buffer {
    if (packet.payload.length > 0xffff) throw new RangeError(`payload of ${packet.payload.length} bytes exceeds 65535`)
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
