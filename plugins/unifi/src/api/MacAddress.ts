/** MAC addresses as the API writes them (lowercase, colon-separated), from any common spelling. */
export class MacAddress {
  /** what params accept: six hex pairs with colons, dashes or nothing between them */
  static readonly pattern = /^\s*[0-9a-fA-F]{2}(?:[:-]?[0-9a-fA-F]{2}){5}\s*$/

  /** "AA-BB-CC-00-11-22" and "aabbcc001122" become "aa:bb:cc:00:11:22"; anything else stays as it was, lowercased */
  static normalize(text: string) {
    const hex = text.replace(/[^0-9a-fA-F]/g, "").toLowerCase()
    return MacAddress.pattern.test(text) && hex.length === 12 ? hex.match(/../g)!.join(":") : text.trim().toLowerCase()
  }

  static equal(a: string | undefined, b: string | undefined) {
    return a !== undefined && b !== undefined && MacAddress.normalize(a) === MacAddress.normalize(b)
  }
}
