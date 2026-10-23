/**
 * A 0x9F packet: the usual header, an AES block count at offset 26, the IV in block 0 and the
 * encrypted body in the remaining blocks. Decrypt with IciCipher.
 */
export class EncryptedPacket {
  static readonly CONTROL = 0x9f
  /** AES block size in bytes; also the IV length */
  static readonly BLOCK_SIZE = 16
  /** offset of the IV; the block count byte sits right before it at offset 26 */
  static readonly BODY_OFFSET = 27

  constructor(
    readonly sourceId: string,
    readonly targetId: string,
    /** first AES block, used as CBC initialisation vector (16 bytes) */
    readonly iv: Buffer,
    /** all blocks after the IV; a multiple of 16 bytes */
    readonly ciphertext: Buffer
  ) {}

  /** total number of AES blocks including the IV block */
  get blockCount() {
    return 1 + this.ciphertext.length / EncryptedPacket.BLOCK_SIZE
  }
}
