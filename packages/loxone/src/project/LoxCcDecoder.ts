import { Lz4Block } from "./Lz4Block.ts"

/**
 * Decompresses a `.LoxCC` file, the form Loxone Config stores a project in on the Miniserver
 * (`sps0.LoxCC` inside `/prog/sps_<version>_<timestamp>.zip`).
 *
 * The format is a 16-byte header (magic 0xaabbccee, compressed size, uncompressed size, checksum,
 * all uint32 LE) followed by one LZ4 block. The checksum's algorithm is unknown, so it is not
 * verified; the uncompressed size is, along with every offset and length.
 */
export class LoxCcDecoder {
  static readonly MAGIC = 0xaabbccee
  static readonly HEADER_BYTES = 16
  /** a large house is around 6 MB; anything far beyond that is a corrupt header */
  static readonly MAX_OUTPUT_BYTES = 64 * 1024 * 1024
  /** LZ4 can't expand more than this, so a header claiming more is checked before allocating */
  private static readonly MAX_RATIO = 255

  /** @throws Error for a bad header, sizes out of range, or a malformed LZ4 block */
  static decode(file: Uint8Array): Buffer {
    if (file.length < LoxCcDecoder.HEADER_BYTES) throw new Error("not a LoxCC file: too short")
    const header = Buffer.from(file.buffer, file.byteOffset, LoxCcDecoder.HEADER_BYTES)
    if (header.readUInt32LE(0) !== LoxCcDecoder.MAGIC) throw new Error("not a LoxCC file: wrong magic")
    const compressed = header.readUInt32LE(4)
    const size = header.readUInt32LE(8)
    if (compressed > file.length - LoxCcDecoder.HEADER_BYTES) throw new Error("LoxCC file is truncated")
    if (size > LoxCcDecoder.MAX_OUTPUT_BYTES) throw new Error(`LoxCC file claims ${size} bytes, more than allowed`)
    if (size > compressed * LoxCcDecoder.MAX_RATIO + 16) throw new Error(`LoxCC file claims ${size} bytes from ${compressed}, more than LZ4 can expand to`)
    const block = file.subarray(LoxCcDecoder.HEADER_BYTES, LoxCcDecoder.HEADER_BYTES + compressed)
    return new Lz4Block(block, size).decode()
  }
}
