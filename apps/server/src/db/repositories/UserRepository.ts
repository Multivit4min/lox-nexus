import type { Database } from "../Database.ts"

export interface UserRow {
  id: string
  username: string
  password_hash: string
  created_at: number
}

/** Accounts. All users are administrators in v1. */
export class UserRepository {
  constructor(private readonly db: Database) {}

  count() {
    return this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM users")?.n ?? 0
  }

  /** case-insensitive, like the UNIQUE constraint */
  findByName(username: string) {
    return this.db.get<UserRow>("SELECT * FROM users WHERE username = :username", { username })
  }

  findById(id: string) {
    return this.db.get<UserRow>("SELECT * FROM users WHERE id = :id", { id })
  }

  insert(user: UserRow) {
    this.db.run(
      "INSERT INTO users (id, username, password_hash, created_at) VALUES (:id, :username, :hash, :createdAt)",
      { id: user.id, username: user.username, hash: user.password_hash, createdAt: user.created_at }
    )
  }

  updatePassword(id: string, hash: string) {
    this.db.run("UPDATE users SET password_hash = :hash WHERE id = :id", { id, hash })
  }
}
