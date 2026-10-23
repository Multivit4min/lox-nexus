/** Strict parsing for command line values; throws with a message naming the option. */
export class Args {
  /** @throws Error if the option is missing or empty */
  static required(value: string | undefined, name: string): string {
    if (value === undefined || value === "") throw new Error(`--${name} is required`)
    return value
  }

  /** Port 0 is accepted on purpose: it means "let the OS pick" when binding. */
  static port(value: string | undefined, name: string): number {
    const port = Number(Args.required(value, name))
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`--${name} must be a port between 0 and 65535, got "${value}"`)
    return port
  }

  /** a finite number above 0, for durations and speed factors */
  static positive(value: string, name: string): number {
    const number = Number(value)
    if (!Number.isFinite(number) || number <= 0) throw new Error(`--${name} must be a positive number, got "${value}"`)
    return number
  }

  /** hex bytes, whitespace allowed; rejects odd lengths and non-hex characters instead of truncating */
  static hex(value: string, name: string): Buffer {
    const clean = value.replace(/\s+/g, "")
    if (!/^(?:[0-9a-f]{2})*$/i.test(clean)) throw new Error(`${name} must be hex bytes, got "${value}"`)
    return Buffer.from(clean, "hex")
  }
}
