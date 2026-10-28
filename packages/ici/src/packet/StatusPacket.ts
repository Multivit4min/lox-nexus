import { IciId } from "../id/IciId.ts"

/**
 * A 0x8D status packet, sent by a Miniserver about every 278 s. Usable as a heartbeat.
 * @experimental bytes 1–3 and 16–28 are not understood; the sender ID and deviceTag are confirmed.
 */
export class StatusPacket {
  static readonly CONTROL = 0x8d
  /** shortest datagram that still contains the source ID (bytes 8–15) */
  static readonly MIN_SIZE = 16

  constructor(
    /** the Miniserver's "Own ID" */
    readonly sourceId: string,
    /** bytes 4–7 as hex: the last four bytes of the Miniserver's serial number (its MAC), reversed */
    readonly deviceTag: string,
    /** the complete datagram, kept because bytes 16–28 are not fully understood */
    readonly raw: Buffer
  ) {}

  /** The tail of the serial number as Loxone Config shows it, e.g. "94:A2:23:EB" for 50:4F:94:A2:23:EB. */
  get serialTail() {
    return Buffer.from(this.deviceTag, "hex").reverse().toString("hex").toUpperCase().replace(/(..)(?!$)/g, "$1:")
  }

  /** The caller must have checked MIN_SIZE. The datagram is kept as is, not copied. */
  static read(buffer: Buffer) {
    return new StatusPacket(IciId.read(buffer, 8), buffer.subarray(4, 8).toString("hex"), buffer)
  }
}
