import { randomUUID } from "node:crypto"
import type { Clock } from "@lox-nexus/core"
import type { Database } from "../db/Database.ts"
import type { UserRepository } from "../db/repositories/UserRepository.ts"
import type { PasswordHasher } from "./PasswordHasher.ts"
import type { SessionService } from "./SessionService.ts"

/** The logged-in user as the rest of the server sees it; never includes the hash. */
export interface AuthUser {
  id: string
  username: string
}

/** Thrown when setup is attempted although a user already exists. */
export class SetupDoneError extends Error {
  constructor() {
    super("setup has already been completed")
  }
}

/** First-run setup, login, logout and session lookup. */
export class AuthService {
  // verified against when the username is unknown, so both cases take the same time
  private dummyHash: Promise<string> | undefined

  constructor(
    private readonly db: Database,
    private readonly users: UserRepository,
    private readonly sessions: SessionService,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock
  ) {}

  /** true until the first account exists */
  needsSetup() {
    return this.users.count() === 0
  }

  /**
   * Creates the first account and logs it in. The existence check and the insert share one
   * transaction, so two racing setup requests can't both create an admin.
   * @throws SetupDoneError when an account already exists
   */
  async setup(username: string, password: string): Promise<{ user: AuthUser; token: string }> {
    const hash = await this.hasher.hash(password)
    const user = { id: randomUUID(), username }
    this.db.transaction(() => {
      if (this.users.count() > 0) throw new SetupDoneError()
      this.users.insert({ id: user.id, username, password_hash: hash, created_at: this.clock.now() })
    })
    return { user, token: this.sessions.create(user.id) }
  }

  /** @returns undefined for an unknown user or a wrong password, without saying which */
  async login(username: string, password: string): Promise<{ user: AuthUser; token: string } | undefined> {
    const row = this.users.findByName(username)
    const valid = await this.hasher.verify(password, row?.password_hash ?? await this.dummy())
    if (!row || !valid) return undefined
    return { user: { id: row.id, username: row.username }, token: this.sessions.create(row.id) }
  }

  /** the user behind a session token, if the session is valid */
  authenticate(token: string): AuthUser | undefined {
    const userId = this.sessions.resolve(token)
    const row = userId === undefined ? undefined : this.users.findById(userId)
    return row && { id: row.id, username: row.username }
  }

  logout(token: string) {
    this.sessions.revoke(token)
  }

  /**
   * Every session of the user ends, including on other devices; the caller gets a fresh one.
   * @returns the new session token, or undefined when the current password is wrong
   */
  async changePassword(userId: string, current: string, next: string): Promise<string | undefined> {
    const row = this.users.findById(userId)
    if (!row || !(await this.hasher.verify(current, row.password_hash))) return undefined
    const hash = await this.hasher.hash(next)
    this.db.transaction(() => {
      this.users.updatePassword(userId, hash)
      this.sessions.revokeAll(userId)
    })
    return this.sessions.create(userId)
  }

  private dummy() {
    this.dummyHash ??= this.hasher.hash(randomUUID())
    return this.dummyHash
  }
}
