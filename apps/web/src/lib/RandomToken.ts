/**
 * New values for config fields the plugin marked with the SDK's token(): 24 bytes from the
 * browser's cryptographic random generator, as 48 hex characters. getRandomValues works on plain
 * http too, where Nexus often runs on a home network.
 */
export class RandomToken {
  static readonly BYTES = 24

  static create(bytes = RandomToken.BYTES): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), byte => byte.toString(16).padStart(2, "0")).join("")
  }
}
