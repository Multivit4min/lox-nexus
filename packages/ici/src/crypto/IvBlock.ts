import { randomBytes } from "node:crypto"

/** The kind byte values of the third-party document. Our test Miniserver uses others (see IvBlock). */
export const IvKind = {
  Text: 0x29,
  Analog: 0x2a,
  Digital: 0x2b,
  /** handshake answer, sent by whoever was challenged */
  Response: 0x4d,
  /** handshake challenge, sent by the receiving Miniserver */
  Challenge: 0x4e
} as const

/**
 * The plaintext of a 0x9F packet's IV. The IV on the wire is this block, AES-ECB-encrypted with the
 * key.
 *
 * | 0–3 magic | 4 kind | 5–11 random nonce | 12–15 sequence (uint32 LE) |
 *
 * Confirmed by a capture from our test Miniserver (2026-10-23), with two corrections to the
 * third-party document:
 * - bytes 12–15 are one 32-bit packet counter XOR-ed with a constant mask (it increased by exactly
 *   1 per packet over 80 packets once unmasked). The document's "counter + constant 3-byte suffix"
 *   is the same thing seen over a short time.
 * - magic and kind differ per sender (document: 4C01E2C5 / analog 0x2A; ours: 42325D2D / 0xC0),
 *   probably masked the same way. They can't be used to check the password or the data type.
 * @experimental
 */
export class IvBlock {
  /** the magic of the third-party document; our test Miniserver uses another one */
  static readonly DOCUMENTED_MAGIC = Buffer.from("4c01e2c5", "hex")
  static readonly SIZE = 16

  constructor(
    readonly kind: number,
    /** 7 random bytes */
    readonly nonce: Buffer,
    /** masked packet counter, as on the wire (uint32 LE at 12–15) */
    readonly sequence: number,
    /** 4 bytes, constant per sender */
    readonly magic: Buffer = IvBlock.DOCUMENTED_MAGIC
  ) {
    if (nonce.length !== 7 || magic.length !== 4) throw new RangeError("an IV block needs a 4-byte magic and a 7-byte nonce")
  }

  /** splits a decrypted IV into its fields; any 16 bytes parse, nothing is checked */
  static parse(plain: Buffer): IvBlock | undefined {
    if (plain.length !== IvBlock.SIZE) return undefined
    return new IvBlock(plain[4]!, Buffer.from(plain.subarray(5, 12)), plain.readUint32LE(12), Buffer.from(plain.subarray(0, 4)))
  }

  /** a fresh block with a random nonce */
  static create(kind: number, sequence: number, magic?: Buffer) {
    return new IvBlock(kind, randomBytes(7), sequence >>> 0, magic)
  }

  /** the IV kind for a data type in the document's numbering (Digital 0 → 0x2B, Analog 1 → 0x2A, Text 2 → 0x29) */
  static kindOf(dataType: number) {
    return IvKind.Digital - dataType
  }

  /** the data type a documented kind announces; undefined for handshakes and other kinds */
  get dataType(): number | undefined {
    const dataType = IvKind.Digital - this.kind
    return dataType >= 0 && dataType <= 2 ? dataType : undefined
  }

  toBuffer() {
    const block = Buffer.alloc(IvBlock.SIZE)
    this.magic.copy(block, 0)
    block[4] = this.kind
    this.nonce.copy(block, 5)
    block.writeUint32LE(this.sequence >>> 0, 12)
    return block
  }
}
