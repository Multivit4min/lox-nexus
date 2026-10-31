/** Just enough DER (ASN.1) to write a self-signed X.509 certificate for tests. */
export class Der {
  static tlv(tag: number, content: Buffer) {
    return Buffer.concat([Buffer.from([tag]), Der.length(content.length), content])
  }

  static sequence(...items: Buffer[]) {
    return Der.tlv(0x30, Buffer.concat(items))
  }

  static set(...items: Buffer[]) {
    return Der.tlv(0x31, Buffer.concat(items))
  }

  /** a non-negative integer from big-endian bytes */
  static integer(bytes: Buffer) {
    return Der.tlv(0x02, bytes[0]! & 0x80 ? Buffer.concat([Buffer.from([0]), bytes]) : bytes)
  }

  static oid(dotted: string) {
    const [first, second, ...rest] = dotted.split(".").map(Number)
    const bytes = [first! * 40 + second!]
    for (const arc of rest) {
      const groups = [arc & 0x7f]
      for (let value = arc >> 7; value > 0; value >>= 7) groups.unshift((value & 0x7f) | 0x80)
      bytes.push(...groups)
    }
    return Der.tlv(0x06, Buffer.from(bytes))
  }

  static utf8(text: string) {
    return Der.tlv(0x0c, Buffer.from(text, "utf8"))
  }

  /** UTCTime, valid up to 2049 */
  static utcTime(date: Date) {
    const iso = date.toISOString()
    const text = `${iso.slice(2, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`
    return Der.tlv(0x17, Buffer.from(text, "ascii"))
  }

  static bitString(content: Buffer) {
    return Der.tlv(0x03, Buffer.concat([Buffer.from([0]), content]))
  }

  /** a context-specific explicit tag, e.g. [0] for the certificate's version */
  static explicit(tag: number, content: Buffer) {
    return Der.tlv(0xa0 + tag, content)
  }

  private static length(length: number) {
    if (length < 0x80) return Buffer.from([length])
    const bytes: number[] = []
    for (let value = length; value > 0; value >>= 8) bytes.unshift(value & 0xff)
    return Buffer.from([0x80 | bytes.length, ...bytes])
  }
}
