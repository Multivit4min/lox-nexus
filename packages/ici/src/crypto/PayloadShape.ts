import { DataType } from "../DataType.ts"

/**
 * Guesses an encrypted packet's data type from its payload when the IV kind is not one we know.
 * The body has no type byte, and our test Miniserver uses other kind values than the documented
 * ones, so this is the fallback: 1 byte is digital, a NUL-terminated string is text, 8 bytes are
 * analog. Smart actuator types (RGBW is also 8 bytes) can't be told apart this way; they need
 * their kind byte, which is still unknown.
 * @experimental
 */
export class PayloadShape {
  static infer(payload: Buffer): number | undefined {
    if (payload.length === 1) return DataType.Digital
    if (PayloadShape.isText(payload)) return DataType.Text
    if (payload.length === 8) return DataType.Analog
    return undefined
  }

  // a double whose bytes look like "7 printable characters + NUL" would be a denormal near zero
  private static isText(payload: Buffer) {
    const end = payload.indexOf(0)
    if (end !== payload.length - 1) return false
    const text = payload.subarray(0, end).toString("utf8")
    // invalid UTF-8 decodes to U+FFFD; control characters other than tab, newline and CR mean binary
    const binary = [...text].some(char => char === "\uFFFD" || (char.charCodeAt(0) < 0x20 && !"\t\n\r".includes(char)))
    return !binary
  }
}
