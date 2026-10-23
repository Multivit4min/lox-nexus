import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto"
import { ConcurrencyLimit } from "./ConcurrencyLimit.ts"

/**
 * scrypt password hashes from node:crypto (see ADR 0008: no native argon2 build).
 * Stored as `scrypt$N$r$p$salt$hash` so the cost can be raised later without breaking old hashes.
 * At most two hashes run at once and eight wait; beyond that BusyError (503) is thrown.
 */
export class PasswordHasher {
  private static readonly KEY_LENGTH = 32
  private readonly limit = new ConcurrencyLimit(2, 8)

  /** @param cost scrypt N; 2^15 uses 32 MiB and roughly 50–100 ms per hash. Tests pass a small value. */
  constructor(private readonly cost = 2 ** 15) {}

  async hash(password: string): Promise<string> {
    const salt = randomBytes(16)
    const options = { N: this.cost, r: 8, p: 1 }
    const key = await this.limit.run(() => PasswordHasher.derive(password, salt, options))
    return ["scrypt", options.N, options.r, options.p, salt.toString("base64url"), key.toString("base64url")].join("$")
  }

  /** false for a wrong password and for anything that is not a hash this class wrote */
  async verify(password: string, stored: string): Promise<boolean> {
    const [scheme, n, r, p, salt, hash] = stored.split("$")
    if (scheme !== "scrypt" || !salt || !hash) return false
    const options = { N: Number(n), r: Number(r), p: Number(p) }
    if (![options.N, options.r, options.p].every(Number.isSafeInteger)) return false
    const expected = Buffer.from(hash, "base64url")
    const key = await this.limit.run(() => PasswordHasher.derive(password, Buffer.from(salt, "base64url"), options))
    return key.length === expected.length && timingSafeEqual(key, expected)
  }

  private static derive(password: string, salt: Buffer, options: ScryptOptions) {
    // maxmem must exceed 128 * N * r, or Node refuses the default cost
    const maxmem = 256 * (options.N ?? 0) * (options.r ?? 8)
    return new Promise<Buffer>((resolve, reject) => {
      scrypt(password.normalize("NFC"), salt, PasswordHasher.KEY_LENGTH, { ...options, maxmem }, (error, key) => (error ? reject(error) : resolve(key)))
    })
  }
}
