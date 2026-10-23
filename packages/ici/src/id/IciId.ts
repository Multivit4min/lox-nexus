/**
 * An 8-byte, NUL-padded identifier (own ID, remote ID or packet ID).
 * Validated on creation so that nothing is ever truncated silently.
 */
export class IciId {
  static readonly SIZE = 8
  private static readonly PATTERN = /^[\x20-\x7e]{1,8}$/

  private constructor(readonly value: string) {}

  static from(value: string): IciId {
    if (!IciId.PATTERN.test(value)) {
      throw new RangeError(`invalid ICI id "${value}": expected 1–8 printable ASCII characters`)
    }
    return new IciId(value)
  }

  static isValid(value: string) {
    return IciId.PATTERN.test(value)
  }

  /** reads an id from the wire, stopping at the first NUL byte */
  static read(buffer: Buffer, offset: number): string {
    const raw = buffer.subarray(offset, offset + IciId.SIZE)
    const end = raw.indexOf(0)
    return raw.subarray(0, end < 0 ? raw.length : end).toString("latin1")
  }

  /** writes the id into a zero-filled buffer */
  write(buffer: Buffer, offset: number) {
    buffer.write(this.value, offset, IciId.SIZE, "latin1")
  }

  toString() {
    return this.value
  }
}
