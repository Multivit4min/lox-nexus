import { createHash, randomBytes } from "node:crypto"
import type { Clock } from "@lox-nexus/core"
import type { SessionRepository } from "../db/repositories/SessionRepository.ts"

/**
 * Opaque session tokens (ADR 0004). The cookie carries the token, the database only its SHA-256.
 * Sessions slide: a token used in the second half of its lifetime is extended.
 */
export class SessionService {
  static readonly TTL_MS = 30 * 24 * 60 * 60 * 1000

  constructor(private readonly sessions: SessionRepository, private readonly clock: Clock) {}

  /** @returns the token for the cookie; it is not stored anywhere in plain form */
  create(userId: string): string {
    const token = randomBytes(32).toString("base64url")
    const now = this.clock.now()
    this.sessions.insert({ token_hash: SessionService.hash(token), user_id: userId, created_at: now, expires_at: now + SessionService.TTL_MS })
    return token
  }

  /** @returns the user id, or undefined for unknown and expired tokens */
  resolve(token: string): string | undefined {
    const hash = SessionService.hash(token)
    const session = this.sessions.find(hash)
    const now = this.clock.now()
    if (!session) return undefined
    if (session.expires_at <= now) {
      this.sessions.delete(hash)
      return undefined
    }
    if (session.expires_at - now < SessionService.TTL_MS / 2) this.sessions.extend(hash, now + SessionService.TTL_MS)
    return session.user_id
  }

  revoke(token: string) {
    this.sessions.delete(SessionService.hash(token))
  }

  revokeAll(userId: string) {
    this.sessions.deleteForUser(userId)
  }

  prune() {
    return this.sessions.deleteExpired(this.clock.now())
  }

  private static hash(token: string) {
    return createHash("sha256").update(token).digest("hex")
  }
}
