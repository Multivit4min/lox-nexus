import { DataPacket } from "../packet/DataPacket.ts"
import { EncryptedPacket } from "../packet/EncryptedPacket.ts"
import { PacketHeader } from "../packet/PacketHeader.ts"
import { StatusPacket } from "../packet/StatusPacket.ts"
import { IciId } from "../id/IciId.ts"
import type { DecodeResult } from "./DecodeResult.ts"

/**
 * Turns datagrams into packets. Every length is checked before it is read, because the receive
 * path must survive any UDP datagram a stranger on the network sends.
 */
export class PacketDecoder {
  /**
   * Classifies a datagram by its control byte and decodes it. Never throws: truncated or
   * inconsistent input yields `malformed` with a reason, unrecognised control bytes yield
   * `unknown`. Payload bytes are copied, so the result does not alias the socket's buffer.
   */
  decode(buffer: Buffer): DecodeResult {
    try {
      return this.decodeUnsafe(buffer)
    } catch (error) {
      // the explicit checks below should make this unreachable; it guards the receive path anyway
      return this.malformed(buffer, error instanceof Error ? error.message : String(error))
    }
  }

  private decodeUnsafe(buffer: Buffer): DecodeResult {
    if (buffer.length === 0) return this.malformed(buffer, "empty datagram")
    const control = buffer.readUint8(0)
    switch (control) {
      case DataPacket.CONTROL: return this.decodeData(buffer)
      case EncryptedPacket.CONTROL: return this.decodeEncrypted(buffer)
      case StatusPacket.CONTROL: return this.decodeStatus(buffer)
      default: return { kind: "unknown", control, buffer }
    }
  }

  private decodeData(buffer: Buffer): DecodeResult {
    if (buffer.length < DataPacket.HEADER_SIZE) {
      return this.malformed(buffer, `data packet has ${buffer.length} bytes, header needs ${DataPacket.HEADER_SIZE}`)
    }
    const length = buffer.readUint16LE(35)
    const end = DataPacket.HEADER_SIZE + length
    if (buffer.length < end) return this.malformed(buffer, `payload length ${length} exceeds datagram`)
    const header = PacketHeader.read(buffer)
    const packet = new DataPacket(
      header.sourceId, header.targetId, IciId.read(buffer, 26), buffer.readUint8(37),
      Buffer.from(buffer.subarray(DataPacket.HEADER_SIZE, end)), Buffer.from(buffer)
    )
    return { kind: "data", packet }
  }

  private decodeEncrypted(buffer: Buffer): DecodeResult {
    const { BODY_OFFSET, BLOCK_SIZE } = EncryptedPacket
    if (buffer.length < BODY_OFFSET) return this.malformed(buffer, "encrypted packet too short for header")
    const blocks = buffer.readUint8(BODY_OFFSET - 1)
    if (blocks < 2) return this.malformed(buffer, `encrypted packet needs at least 2 blocks, got ${blocks}`)
    if (buffer.length < BODY_OFFSET + blocks * BLOCK_SIZE) {
      return this.malformed(buffer, `encrypted packet announces ${blocks} blocks but is too short`)
    }
    const header = PacketHeader.read(buffer)
    const iv = Buffer.from(buffer.subarray(BODY_OFFSET, BODY_OFFSET + BLOCK_SIZE))
    const ciphertext = Buffer.from(buffer.subarray(BODY_OFFSET + BLOCK_SIZE, BODY_OFFSET + blocks * BLOCK_SIZE))
    return { kind: "encrypted", packet: new EncryptedPacket(header.sourceId, header.targetId, iv, ciphertext) }
  }

  private decodeStatus(buffer: Buffer): DecodeResult {
    if (buffer.length < StatusPacket.MIN_SIZE) return this.malformed(buffer, "status packet too short")
    return { kind: "status", packet: StatusPacket.read(Buffer.from(buffer)) }
  }

  private malformed(buffer: Buffer, reason: string): DecodeResult {
    return { kind: "malformed", reason, buffer }
  }
}
