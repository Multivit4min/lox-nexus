import { randomBytes } from "node:crypto"

/** The type byte of an IV block: what the packet carries. */
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
 * key, so decrypting it and finding PREFIX is how a receiver validates the password.
 *
 * | 0–3 prefix 4C01E2C5 | 4 kind | 5–11 random nonce | 12 counter | 13–15 sender suffix |
 *
 * @experimental from a third-party reverse engineering (see PROTOCOL.md), not yet confirmed by our
 * own captures. Digital/Analog/Text kinds are documented; 0x2B − dataType for the other data types
 * is our extrapolation.
 */
export class IvBlock {
  static readonly PREFIX = Buffer.from("4c01e2c5", "hex")
  static readonly SIZE = 16

  constructor(
    readonly kind: number,
    /** 7 random bytes */
    readonly nonce: Buffer,
    /** 0–255, incremented per packet by the sender, wraps */
    readonly counter: number,
    /** 3 bytes, constant per sending device */
    readonly suffix: Buffer
  ) {
    if (nonce.length !== 7 || suffix.length !== 3) throw new RangeError("an IV block needs a 7-byte nonce and a 3-byte suffix")
  }

  /** undefined when the prefix doesn't match, i.e. the block was decrypted with the wrong key */
  static parse(plain: Buffer): IvBlock | undefined {
    if (plain.length !== IvBlock.SIZE || !plain.subarray(0, 4).equals(IvBlock.PREFIX)) return undefined
    return new IvBlock(plain[4]!, Buffer.from(plain.subarray(5, 12)), plain[12]!, Buffer.from(plain.subarray(13, 16)))
  }

  /** a fresh block with a random nonce */
  static create(kind: number, counter: number, suffix: Buffer) {
    return new IvBlock(kind, randomBytes(7), counter & 0xff, suffix)
  }

  /** the IV kind for a data type (Digital 0 → 0x2B, Analog 1 → 0x2A, Text 2 → 0x29, …) */
  static kindOf(dataType: number) {
    return IvKind.Digital - dataType
  }

  get isHandshake() {
    return this.kind === IvKind.Challenge || this.kind === IvKind.Response
  }

  /** the data type this block announces, undefined for handshakes and unknown kinds */
  get dataType(): number | undefined {
    const dataType = IvKind.Digital - this.kind
    return dataType >= 0 && dataType <= 6 ? dataType : undefined
  }

  toBuffer() {
    const block = Buffer.alloc(IvBlock.SIZE)
    IvBlock.PREFIX.copy(block, 0)
    block[4] = this.kind
    this.nonce.copy(block, 5)
    block[12] = this.counter
    this.suffix.copy(block, 13)
    return block
  }
}
