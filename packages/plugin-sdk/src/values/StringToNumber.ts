/**
 * Lenient number parsing for strings from other systems: "20%" -> 0.2, "20.5€" -> 20.5,
 * "1.234,5" -> 1234.5, "1,234,567" -> 1234567, "2_000" -> 2000. Anything unparseable becomes 0.
 *
 * With only one kind of separator, a single separator is a decimal point ("0.125" -> 0.125,
 * "12,5" -> 12.5). It is read as digit grouping only when it repeats ("1.234.567"). The old
 * converter treated "0.125" as 125.
 */
export class StringToNumber {
  /** whitespace (JavaScript's \s already covers no-break spaces) and digit-group underscores */
  private static readonly IGNORED = /[\s_]/g

  /**
   * @returns the parsed number; a trailing % divides by 100. Never throws and never returns
   *   NaN or Infinity, 0 is the answer for anything that does not look like a number.
   */
  parse(input: string): number {
    let text = input.trim().replace(StringToNumber.IGNORED, "")
    if (!text) return 0
    const percent = text.endsWith("%")
    if (percent) text = text.slice(0, -1)
    text = this.stripCurrency(text)
    text = this.normalizeSeparators(text)
    if (!/^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text)) return 0
    const number = Number(text)
    if (!Number.isFinite(number)) return 0
    return percent ? number / 100 : number
  }

  private stripCurrency(text: string) {
    if (/\p{Sc}$/u.test(text)) return text.slice(0, -1)
    if (/^\p{Sc}/u.test(text)) return text.slice(1)
    return text
  }

  private normalizeSeparators(text: string) {
    const hasDot = text.includes(".")
    const hasComma = text.includes(",")
    if (hasDot && hasComma) {
      return text.lastIndexOf(",") > text.lastIndexOf(".")
        ? text.replace(/\./g, "").replace(/,/g, ".")
        : text.replace(/,/g, "")
    }
    if (hasComma) return /^\d{1,3}(,\d{3}){2,}$/.test(text) ? text.replace(/,/g, "") : text.replace(/,/g, ".")
    if (hasDot && /^\d{1,3}(\.\d{3}){2,}$/.test(text)) return text.replace(/\./g, "")
    return text
  }
}
