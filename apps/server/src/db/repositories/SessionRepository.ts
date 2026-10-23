import type { Database } from "../Database.ts"

/** A row of the `sessions` table; the timestamps are epoch ms. */
export interface SessionRow {
  token_hash: string
  user_id: string
  created_at: number
  expires_at: number
}

/** Login sessions. Only a hash of the token is stored, so a leaked database can't be used to log in. */
export class SessionRepository {
  constructor(private readonly db: Database) {}

  /** `token_hash` is SessionService.hash(token), never the token */
  insert(session: SessionRow) {
    this.db.run(
      "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (:hash, :userId, :createdAt, :expiresAt)",
      { hash: session.token_hash, userId: session.user_id, createdAt: session.created_at, expiresAt: session.expires_at }
    )
  }

  /** the row regardless of expiry: SessionService decides whether it is still valid */
  find(tokenHash: string) {
    return this.db.get<SessionRow>("SELECT * FROM sessions WHERE token_hash = :hash", { hash: tokenHash })
  }

  /** sets the new expiry in epoch ms */
  extend(tokenHash: string, expiresAt: number) {
    this.db.run("UPDATE sessions SET expires_at = :expiresAt WHERE token_hash = :hash", { hash: tokenHash, expiresAt })
  }

  delete(tokenHash: string) {
    this.db.run("DELETE FROM sessions WHERE token_hash = :hash", { hash: tokenHash })
  }

  /** logs a user out everywhere, e.g. after a password change */
  deleteForUser(userId: string) {
    this.db.run("DELETE FROM sessions WHERE user_id = :userId", { userId })
  }

  /** @returns how many expired sessions were removed */
  deleteExpired(now: number) {
    return Number(this.db.run("DELETE FROM sessions WHERE expires_at <= :now", { now }).changes)
  }
}
