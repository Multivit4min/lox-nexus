import { createHash, randomBytes } from "node:crypto"
import { EventEmitter } from "node:events"
import type { Clock } from "@lox-nexus/core"
import type { SessionRepository } from "../db/repositories/SessionRepository.ts"

/** Events of SessionService; BusStream closes live connections of revoked sessions. */
export interface SessionEvents {
  /** one session (by token hash) or all of a user's sessions ended */
  revoked: [which: { tokenHash: string } | { userId: string }]
}

/**
 * Opaque session tokens (ADR 0004). The cookie carries the token, the database only its SHA-256.
 * Sessions slide: a token used in the second half of its lifetime is extended, and resolve()
 * says so, so the cookie can be renewed too.
 */
export class SessionService extends EventEmitter<SessionEvents> {
  static readonly TTL_MS = 30 * 24 * 60 * 60 * 1000

  constructor(private readonly sessions: SessionRepository, private readonly clock: Clock) {
    super()
  }

  /** @returns the token for the cookie; it is not stored anywhere in plain form */
  create(userId: string): string {
    const token = randomBytes(32).toString("base64url")
    const now = this.clock.now()
    this.sessions.insert({ token_hash: SessionService.hash(token), user_id: userId, created_at: now, expires_at: now + SessionService.TTL_MS })
    return token
  }

  /** @returns the user id and whether the expiry was pushed back; undefined for unknown and expired tokens */
  resolve(token: string): { userId: string; renewed: boolean } | undefined {
    const hash = SessionService.hash(token)
    const session = this.sessions.find(hash)
    const now = this.clock.now()
    if (!session) return undefined
    if (session.expires_at <= now) {
      this.sessions.delete(hash)
      return undefined
    }
    const renewed = session.expires_at - now < SessionService.TTL_MS / 2
    if (renewed) this.sessions.extend(hash, now + SessionService.TTL_MS)
    return { userId: session.user_id, renewed }
  }

  revoke(token: string) {
    const tokenHash = SessionService.hash(token)
    this.sessions.delete(tokenHash)
    this.emit("revoked", { tokenHash })
  }

  revokeAll(userId: string) {
    this.sessions.deleteForUser(userId)
    this.emit("revoked", { userId })
  }

  prune() {
    return this.sessions.deleteExpired(this.clock.now())
  }

  /** what the database stores for a token; also how live connections remember their session */
  static hash(token: string) {
    return createHash("sha256").update(token).digest("hex")
  }
}
