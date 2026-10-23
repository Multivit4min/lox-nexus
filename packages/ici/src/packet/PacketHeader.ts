import { IciId } from "../id/IciId.ts"

/**
 * The first 26 bytes shared by data (0x9E) and encrypted (0x9F) packets:
 * control byte, source ID at 8–15 and target ID at 17–24. All other bytes are 0 on the wire.
 */
export class PacketHeader {
  static readonly SIZE = 26

  constructor(
    readonly control: number,
    readonly sourceId: string,
    readonly targetId: string
  ) {}

  /** The caller must ensure the buffer holds at least SIZE bytes; the decoder checks this first. */
  static read(buffer: Buffer) {
    return new PacketHeader(buffer.readUint8(0), IciId.read(buffer, 8), IciId.read(buffer, 17))
  }

  /** writes into a zero-filled buffer of at least SIZE bytes; validates the ids */
  write(buffer: Buffer) {
    buffer.writeUint8(this.control, 0)
    IciId.from(this.sourceId).write(buffer, 8)
    IciId.from(this.targetId).write(buffer, 17)
  }
}
