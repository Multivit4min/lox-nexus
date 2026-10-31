import type { Database } from "../Database.ts"

/** A row of the `users` table; password_hash is the encoded PasswordHasher output. */
export interface UserRow {
  id: string
  username: string
  password_hash: string
  created_at: number
  /** epoch ms of the last successful login; null before the first (or before migration 11) */
  last_login_at?: number | null
}

/** Accounts. Every user is an administrator; there are no roles. */
export class UserRepository {
  constructor(private readonly db: Database) {}

  /** used to detect first-run setup */
  count() {
    return this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM users")?.n ?? 0
  }

  /** case-insensitive, like the UNIQUE constraint */
  findByName(username: string) {
    return this.db.get<UserRow>("SELECT * FROM users WHERE username = :username", { username })
  }

  /** every username, sorted; for tools that let an operator pick an account */
  usernames() {
    return this.db.all<{ username: string }>("SELECT username FROM users ORDER BY username").map(row => row.username)
  }

  /** undefined when the user was deleted */
  findById(id: string) {
    return this.db.get<UserRow>("SELECT * FROM users WHERE id = :id", { id })
  }

  /** @throws when the username exists already (case-insensitively) */
  insert(user: UserRow) {
    this.db.run(
      "INSERT INTO users (id, username, password_hash, created_at) VALUES (:id, :username, :hash, :createdAt)",
      { id: user.id, username: user.username, hash: user.password_hash, createdAt: user.created_at }
    )
  }

  /** every account for the users page, by name */
  list() {
    return this.db.all<UserRow>("SELECT * FROM users ORDER BY username")
  }

  /** sessions go with it (ON DELETE CASCADE); @returns whether it existed */
  delete(id: string) {
    return Number(this.db.run("DELETE FROM users WHERE id = :id", { id }).changes) > 0
  }

  loggedIn(id: string, at: number) {
    this.db.run("UPDATE users SET last_login_at = :at WHERE id = :id", { id, at })
  }

  /** callers revoke the user's sessions in the same transaction */
  updatePassword(id: string, hash: string) {
    this.db.run("UPDATE users SET password_hash = :hash WHERE id = :id", { id, hash })
  }
}
