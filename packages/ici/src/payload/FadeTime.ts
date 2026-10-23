/** Fade times travel as uint16 in tenths of a second (confirmed for RGBW, see PROTOCOL.md). */
export class FadeTime {
  /** largest value the uint16 field can hold, 6553.5 s */
  static readonly MAX_SECONDS = 0xffff / 10

  /** @returns seconds */
  static read(buffer: Buffer, offset: number): number {
    return buffer.readUint16LE(offset) / 10
  }

  /**
   * Writes seconds as tenths, rounded to the nearest 0.1 s.
   * @throws RangeError for NaN, negative values or more than MAX_SECONDS. Callers should sanitise
   *   first; the codec refuses instead of clamping so no silent change reaches the lighting.
   */
  static write(buffer: Buffer, offset: number, seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > FadeTime.MAX_SECONDS) {
      throw new RangeError(`fade time must be between 0 and ${FadeTime.MAX_SECONDS} s, got ${seconds}`)
    }
    buffer.writeUint16LE(Math.round(seconds * 10), offset)
  }
}
