import { IciId } from "../id/IciId.ts"

/**
 * A 0x8D status packet, sent by a Miniserver about every 278 s. Usable as a heartbeat.
 * @experimental only the sender ID is confirmed; deviceTag is believed to be the MAC tail.
 */
export class StatusPacket {
  static readonly CONTROL = 0x8d
  static readonly MIN_SIZE = 16

  constructor(
    readonly sourceId: string,
    /** bytes 4–7 as hex, constant per Miniserver */
    readonly deviceTag: string,
    readonly raw: Buffer
  ) {}

  static read(buffer: Buffer) {
    return new StatusPacket(IciId.read(buffer, 8), buffer.subarray(4, 8).toString("hex"), buffer)
  }
}
