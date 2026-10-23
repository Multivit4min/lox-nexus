import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { IciId } from "../id/IciId.ts"
import { DataPacket } from "../packet/DataPacket.ts"
import { EncryptedPacket } from "../packet/EncryptedPacket.ts"
import { IvBlock, IvKind } from "./IvBlock.ts"
import { IvSequence } from "./IvSequence.ts"

/** What a 0x9F packet turned out to be. */
export type OpenedPacket =
  | { kind: "data"; packet: DataPacket; iv: IvBlock }
  | { kind: "challenge" | "response"; iv: IvBlock }

/**
 * AES-128 for 0x9F packets, key = SHA256(password)[0..15].
 *
 * The IV on the wire is an IvBlock encrypted with AES-ECB; decrypting it and finding the magic
 * prefix validates the password. The body is AES-CBC with that IV:
 * | 0–8 packet id, NUL-terminated | 9–10 payload length (uint16 LE) | payload | random padding |
 * There is no type byte: the data type comes from the IV's kind.
 *
 * @experimental layout from a third-party reverse engineering (PROTOCOL.md), awaiting our own capture.
 */
export class IciCipher {
  private static readonly ID_FIELD = 9
  private static readonly HEAD = 11
  private readonly key: Buffer

  /** @param sequence issues the IVs for seal() and handshake(); one per sender */
  constructor(password: string, private readonly sequence = new IvSequence()) {
    this.key = createHash("sha256").update(password, "utf8").digest().subarray(0, 16)
  }

  /**
   * @throws RangeError for a wrong password (IV prefix mismatch), an unknown kind or a corrupt
   *   body. Callers on the receive path must catch this.
   */
  open(packet: EncryptedPacket): OpenedPacket {
    const iv = IvBlock.parse(this.ecb("decrypt", packet.iv))
    if (!iv) throw new RangeError("wrong password: the IV does not decrypt to the Loxone prefix")
    if (iv.kind === IvKind.Challenge) return { kind: "challenge", iv }
    if (iv.kind === IvKind.Response) return { kind: "response", iv }
    const dataType = iv.dataType
    if (dataType === undefined) throw new RangeError(`unknown encrypted packet kind 0x${iv.kind.toString(16)}`)
    const decipher = createDecipheriv("aes-128-cbc", this.key, packet.iv).setAutoPadding(false)
    const body = Buffer.concat([decipher.update(packet.ciphertext), decipher.final()])
    if (body.length < IciCipher.HEAD) throw new RangeError("encrypted body is shorter than its header")
    const length = body.readUint16LE(IciCipher.ID_FIELD)
    if (IciCipher.HEAD + length > body.length) throw new RangeError(`payload length ${length} exceeds the decrypted body`)
    const packetId = IciId.read(body, 0)
    const payload = Buffer.from(body.subarray(IciCipher.HEAD, IciCipher.HEAD + length))
    return { kind: "data", packet: new DataPacket(packet.sourceId, packet.targetId, packetId, dataType, payload), iv }
  }

  /**
   * Encrypts a data packet; the body is filled up to whole blocks with random bytes.
   * @param iv only for tests; by default the next block of this cipher's sequence
   * @throws RangeError for an invalid packet id or a data type without an IV kind
   */
  seal(packet: DataPacket, iv = this.sequence.next(IvBlock.kindOf(packet.dataType))): EncryptedPacket {
    if (iv.dataType !== packet.dataType) throw new RangeError(`IV kind 0x${iv.kind.toString(16)} does not match data type ${packet.dataType}`)
    const head = Buffer.alloc(IciCipher.HEAD)
    IciId.from(packet.packetId).write(head, 0)
    head.writeUint16LE(packet.payload.length, IciCipher.ID_FIELD)
    const plain = Buffer.concat([head, packet.payload])
    const padded = Buffer.concat([plain, randomBytes((16 - (plain.length % 16)) % 16)])
    const wireIv = this.ecb("encrypt", iv.toBuffer())
    const cipher = createCipheriv("aes-128-cbc", this.key, wireIv).setAutoPadding(false)
    return new EncryptedPacket(packet.sourceId, packet.targetId, wireIv, Buffer.concat([cipher.update(padded), cipher.final()]))
  }

  /** a one-block handshake packet: a challenge, or the response to one */
  handshake(kind: "challenge" | "response", sourceId: string, targetId: string, iv = this.sequence.next(kind === "challenge" ? IvKind.Challenge : IvKind.Response)) {
    return new EncryptedPacket(sourceId, targetId, this.ecb("encrypt", iv.toBuffer()), Buffer.alloc(0))
  }

  private ecb(direction: "encrypt" | "decrypt", block: Buffer) {
    const cipher = direction === "encrypt"
      ? createCipheriv("aes-128-ecb", this.key, null).setAutoPadding(false)
      : createDecipheriv("aes-128-ecb", this.key, null).setAutoPadding(false)
    return Buffer.concat([cipher.update(block), cipher.final()])
  }
}
