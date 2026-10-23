/** Fade times travel as uint16 in tenths of a second (confirmed for RGBW, see PROTOCOL.md). */
export class FadeTime {
  static readonly MAX_SECONDS = 0xffff / 10

  static read(buffer: Buffer, offset: number): number {
    return buffer.readUint16LE(offset) / 10
  }

  static write(buffer: Buffer, offset: number, seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > FadeTime.MAX_SECONDS) {
      throw new RangeError(`fade time must be between 0 and ${FadeTime.MAX_SECONDS} s, got ${seconds}`)
    }
    buffer.writeUint16LE(Math.round(seconds * 10), offset)
  }
}
