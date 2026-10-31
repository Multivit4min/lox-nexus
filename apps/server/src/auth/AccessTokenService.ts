import { createHash, randomBytes, randomUUID } from "node:crypto"
import type { AccessScope, AccessTokenDto } from "@lox-nexus/api"
import type { Clock } from "@lox-nexus/plugin-sdk"
import { AccessTokenRepository, type AccessTokenRow } from "../db/repositories/AccessTokenRepository.ts"
import type { UserRepository } from "../db/repositories/UserRepository.ts"
import type { AuthUser } from "./AuthService.ts"
import { TooManyTokensError } from "./TooManyTokensError.ts"

/** what a request made with a token may do; set on the request by AuthGuard */
export interface AccessContext {
  tokenId: string
  name: string
  scopes: readonly AccessScope[]
}

/**
 * Personal access tokens for MCP (ADR 0020). A token is `nxp_` and 32 random bytes; only its
 * SHA-256 is stored, so the database never holds a usable token. Tokens don't expire: they end
 * when revoked, when their user is deleted, or when the user's password changes (a trigger in
 * migration 12). Each user sees and revokes only their own.
 */
export class AccessTokenService {
  /** keeps a forgotten script from piling up tokens */
  static readonly MAX_PER_USER = 20
  /** last use is written at most this often, not on every request */
  static readonly USE_RESOLUTION_MS = 60_000
  private static readonly PREFIX = "nxp_"

  constructor(private readonly tokens: AccessTokenRepository, private readonly users: Pick<UserRepository, "findById">, private readonly clock: Pick<Clock, "now">) {}

  list(userId: string): AccessTokenDto[] {
    return this.tokens.listFor(userId).map(row => AccessTokenService.dto(row))
  }

  /**
   * `read` is always granted. `passwordHash` is the hash the caller checked the password against;
   * the token is made only while it is still the user's.
   * @returns undefined when the password changed meanwhile
   * @throws TooManyTokensError when the user has MAX_PER_USER tokens already
   */
  create(userId: string, name: string, scopes: readonly AccessScope[], passwordHash: string) {
    if (this.tokens.countFor(userId) >= AccessTokenService.MAX_PER_USER) throw new TooManyTokensError(AccessTokenService.MAX_PER_USER)
    const granted: AccessScope[] = ["read", ...(["configure", "operate"] as const).filter(scope => scopes.includes(scope))]
    const token = `${AccessTokenService.PREFIX}${randomBytes(32).toString("base64url")}`
    const row = { id: randomUUID(), user_id: userId, name, scopes: JSON.stringify(granted), token_sha256: AccessTokenService.hash(token), created_at: this.clock.now() }
    if (!this.tokens.insertIfPassword(row, passwordHash)) return undefined
    return { token, accessToken: AccessTokenService.dto({ ...row, last_used_at: null }) }
  }

  /** @returns whether the user had it */
  revoke(userId: string, id: string) {
    return this.tokens.delete(userId, id)
  }

  /** the user and access behind a token, or undefined for an unknown, revoked or malformed one */
  authenticate(token: string): { user: AuthUser; access: AccessContext } | undefined {
    if (!token.startsWith(AccessTokenService.PREFIX) || token.length > 100) return undefined
    const row = this.tokens.findByHash(AccessTokenService.hash(token))
    const user = row && this.users.findById(row.user_id)
    if (!row || !user) return undefined
    const now = this.clock.now()
    if (row.last_used_at === null || now - row.last_used_at >= AccessTokenService.USE_RESOLUTION_MS) this.tokens.used(row.id, now)
    return { user: { id: user.id, username: user.username }, access: { tokenId: row.id, name: row.name, scopes: AccessTokenRepository.scopes(row) } }
  }

  private static hash(token: string) {
    return createHash("sha256").update(token).digest("hex")
  }

  private static dto(row: AccessTokenRow): AccessTokenDto {
    return { id: row.id, name: row.name, scopes: AccessTokenRepository.scopes(row), createdAt: row.created_at, ...(row.last_used_at ? { lastUsedAt: row.last_used_at } : {}) }
  }
}

