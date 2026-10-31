/**
 * A certificate's SHA-256 fingerprint as the user types it: 64 hex digits, in pairs separated by
 * colons, spaces or dashes (browsers and openssl print it in different ways), or not at all.
 */
export class CertificateFingerprint {
  /** what the config field accepts */
  static readonly pattern = /^\s*(?:[0-9a-fA-F]{2}[:\s-]?){31}[0-9a-fA-F]{2}\s*$/

  private constructor(readonly hex: string) {}

  /** @throws Error for anything but 32 bytes of hex */
  static parse(text: string) {
    if (!CertificateFingerprint.pattern.test(text)) throw new Error("a SHA-256 fingerprint is 64 hex digits, e.g. AB:CD:…")
    return new CertificateFingerprint(text.replace(/[^0-9a-fA-F]/g, "").toUpperCase())
  }

  /** Node's `fingerprint256` ("AB:CD:…") or any other spelling of the same bytes */
  matches(other: string) {
    return other.replace(/[^0-9a-fA-F]/g, "").toUpperCase() === this.hex
  }

  /** the colon-separated form browsers and openssl show */
  toString() {
    return this.hex.match(/../g)!.join(":")
  }
}
