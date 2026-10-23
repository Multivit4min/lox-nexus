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
  /** header bytes that have always been 0 so far (shared header layout with 0x9E) */
  static readonly RESERVED_OFFSETS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 16, 25]

  constructor(
    readonly sourceId: string,
    readonly targetId: string,
    /** first AES block, used as CBC initialisation vector (16 bytes) */
    readonly iv: Buffer,
    /** all blocks after the IV; a multiple of 16 bytes */
    readonly ciphertext: Buffer,
    /** the complete datagram as received; undefined for packets built locally */
    readonly raw?: Buffer
  ) {}

  /** @experimental offsets of reserved header bytes that are not 0 in the received datagram */
  reservedNonZero(): number[] {
    const raw = this.raw
    return raw ? EncryptedPacket.RESERVED_OFFSETS.filter(offset => raw[offset] !== 0) : []
  }

  /** @experimental bytes after the announced AES blocks in the received datagram */
  trailing(): Buffer {
    const end = EncryptedPacket.BODY_OFFSET + this.iv.length + this.ciphertext.length
    return this.raw ? this.raw.subarray(end) : Buffer.alloc(0)
  }

  /** total number of AES blocks including the IV block */
  get blockCount() {
    return 1 + this.ciphertext.length / EncryptedPacket.BLOCK_SIZE
  }
}
