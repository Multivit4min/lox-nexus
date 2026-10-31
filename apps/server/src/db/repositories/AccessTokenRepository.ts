import { AccessScopeSchema, type AccessScope } from "@lox-nexus/api"
import { z } from "zod"
import type { Database } from "../Database.ts"

/** A row of `access_tokens`; `scopes` is a JSON array, `token_sha256` the hash of the token. */
export interface AccessTokenRow {
  id: string
  user_id: string
  name: string
  scopes: string
  token_sha256: string
  created_at: number
  last_used_at: number | null
}

/** The personal access tokens of all users (migration 12). Rows end with their user and with a password change (trigger). */
export class AccessTokenRepository {
  constructor(private readonly db: Database) {}

  /**
   * Inserts the token only while the user's password hash is still `passwordHash`, in one
   * statement: a password change that ran while the password was being checked (and whose trigger
   * ended the tokens) can't be outlived by a token made with the old password.
   * @returns whether it was inserted
   */
  insertIfPassword(row: Omit<AccessTokenRow, "last_used_at">, passwordHash: string) {
    return Number(this.db.run(
      `INSERT INTO access_tokens (id, user_id, name, scopes, token_sha256, created_at)
       SELECT :id, :userId, :name, :scopes, :hash, :createdAt WHERE EXISTS (SELECT 1 FROM users WHERE id = :userId AND password_hash = :passwordHash)`,
      { id: row.id, userId: row.user_id, name: row.name, scopes: row.scopes, hash: row.token_sha256, createdAt: row.created_at, passwordHash }
    ).changes) > 0
  }

  /** a user's tokens, newest first */
  listFor(userId: string) {
    return this.db.all<AccessTokenRow>("SELECT * FROM access_tokens WHERE user_id = :userId ORDER BY created_at DESC", { userId })
  }

  countFor(userId: string) {
    return this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM access_tokens WHERE user_id = :userId", { userId })?.n ?? 0
  }

  findByHash(hash: string) {
    return this.db.get<AccessTokenRow>("SELECT * FROM access_tokens WHERE token_sha256 = :hash", { hash })
  }

  /** only one of the user's own; @returns whether it existed */
  delete(userId: string, id: string) {
    return Number(this.db.run("DELETE FROM access_tokens WHERE id = :id AND user_id = :userId", { id, userId }).changes) > 0
  }

  used(id: string, at: number) {
    this.db.run("UPDATE access_tokens SET last_used_at = :at WHERE id = :id", { id, at })
  }

  /** what each user has, for the users page */
  counts() {
    return new Map(this.db.all<{ user_id: string; n: number }>("SELECT user_id, COUNT(*) AS n FROM access_tokens GROUP BY user_id").map(row => [row.user_id, row.n]))
  }

  /** the stored scopes; a row that can't be read grants only `read` */
  static scopes(row: AccessTokenRow): AccessScope[] {
    try {
      const parsed = z.array(AccessScopeSchema).safeParse(JSON.parse(row.scopes))
      return parsed.success ? parsed.data : ["read"]
    } catch {
      return ["read"]
    }
  }
}
