import { IciId } from "../id/IciId.ts"

/**
 * A 0x8D status packet, sent by a Miniserver about every 278 s. Usable as a heartbeat.
 * @experimental only the sender ID is confirmed; deviceTag is believed to be the MAC tail.
 */
export class StatusPacket {
  static readonly CONTROL = 0x8d
  /** shortest datagram that still contains the source ID (bytes 8–15) */
  static readonly MIN_SIZE = 16

  constructor(
    /** the Miniserver's "Own ID" */
    readonly sourceId: string,
    /** bytes 4–7 as hex, constant per Miniserver */
    readonly deviceTag: string,
    /** the complete datagram, kept because bytes 16–28 are not fully understood */
    readonly raw: Buffer
  ) {}

  /** The caller must have checked MIN_SIZE. The datagram is kept as is, not copied. */
  static read(buffer: Buffer) {
    return new StatusPacket(IciId.read(buffer, 8), buffer.subarray(4, 8).toString("hex"), buffer)
  }
}
