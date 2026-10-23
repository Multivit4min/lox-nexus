import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { IciId } from "../id/IciId.ts"
import { DataPacket } from "../packet/DataPacket.ts"
import { EncryptedPacket } from "../packet/EncryptedPacket.ts"

/**
 * AES-128-CBC for 0x9F packets, key = SHA256(password)[0..15].
 *
 * @experimental The decrypted layout (packet ID at 0–7, length at 9–10, data type at 11,
 * payload from 12) is unconfirmed by a real capture; see PROTOCOL.md "Open questions".
 */
export class IciCipher {
  private static readonly ALGORITHM = "aes-128-cbc"
  private readonly key: Buffer

  /** The key is derived once; construct one cipher per remote peer password. */
  constructor(password: string) {
    this.key = createHash("sha256").update(password, "utf8").digest().subarray(0, 16)
  }

  /**
   * decrypts the packet into a data packet. There is no MAC, so a wrong password is detected by
   * structure only: a valid packet id, a zero separator byte and zero padding.
   * @throws RangeError for a wrong password or a corrupt body. Callers on the receive path must
   *   catch this; it is the normal outcome when a peer uses a different password.
   */
  open(packet: EncryptedPacket): DataPacket {
    const decipher = createDecipheriv(IciCipher.ALGORITHM, this.key, packet.iv).setAutoPadding(false)
    const body = Buffer.concat([decipher.update(packet.ciphertext), decipher.final()])
    const length = body.readUint16LE(9)
    const packetId = IciId.read(body, 0)
    if (12 + length > body.length) throw new RangeError(`decrypted payload length ${length} exceeds body (wrong password?)`)
    if (!IciId.isValid(packetId) || body.readUint8(8) !== 0 || body.subarray(12 + length).some(byte => byte !== 0)) {
      throw new RangeError("decrypted body is not a valid packet (wrong password?)")
    }
    const payload = Buffer.from(body.subarray(12, 12 + length))
    return new DataPacket(packet.sourceId, packet.targetId, packetId, body.readUint8(11), payload)
  }

  /**
   * encrypts a data packet; the body is zero-padded to whole AES blocks.
   * @param iv only injectable so tests are deterministic; production code uses the random default,
   *   because reusing an IV under CBC leaks equal prefixes.
   * @throws RangeError for an invalid packet id
   */
  seal(packet: DataPacket, iv: Buffer = randomBytes(16)): EncryptedPacket {
    const head = Buffer.alloc(12)
    IciId.from(packet.packetId).write(head, 0)
    head.writeUint16LE(packet.payload.length, 9)
    head.writeUint8(packet.dataType, 11)
    const plain = Buffer.concat([head, packet.payload])
    const padded = Buffer.concat([plain, Buffer.alloc((16 - (plain.length % 16)) % 16)])
    const cipher = createCipheriv(IciCipher.ALGORITHM, this.key, iv).setAutoPadding(false)
    const ciphertext = Buffer.concat([cipher.update(padded), cipher.final()])
    return new EncryptedPacket(packet.sourceId, packet.targetId, Buffer.from(iv), ciphertext)
  }
}
