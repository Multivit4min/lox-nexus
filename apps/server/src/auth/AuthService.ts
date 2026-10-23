import { randomUUID } from "node:crypto"
import type { Clock } from "@lox-nexus/core"
import type { Database } from "../db/Database.ts"
import type { UserRepository } from "../db/repositories/UserRepository.ts"
import type { PasswordHasher } from "./PasswordHasher.ts"
import type { SessionService } from "./SessionService.ts"
import { SetupDoneError } from "./SetupDoneError.ts"

/** The logged-in user as the rest of the server sees it; never includes the hash. */
export interface AuthUser {
  id: string
  username: string
}

/** A valid session: its user, and whether its expiry was just extended (the cookie should be renewed). */
export interface AuthSession {
  user: AuthUser
  renewed: boolean
}

/**
 * First-run setup, login, logout, password change and session lookup. Password checks are
 * constant-effort: an unknown user costs the same hash as a wrong password, so response time
 * doesn't reveal which usernames exist.
 */
export class AuthService {
  // verified against when the username is unknown, so both cases take the same time; computed
  // up front so the first unknown-user login isn't slower than the others
  private readonly dummyHash: Promise<string>

  constructor(
    private readonly db: Database,
    private readonly users: UserRepository,
    private readonly sessions: SessionService,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock
  ) {
    this.dummyHash = hasher.hash(randomUUID())
    this.dummyHash.catch(() => undefined)
  }

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
    // refused before hashing, so the public setup route can't be used to burn CPU after setup
    if (!this.needsSetup()) throw new SetupDoneError()
    const hash = await this.hasher.hash(password)
    const user = { id: randomUUID(), username }
    this.db.transaction(() => {
      if (this.users.count() > 0) throw new SetupDoneError()
      this.users.insert({ id: user.id, username, password_hash: hash, created_at: this.clock.now() })
    })
    return { user, token: this.sessions.create(user.id) }
  }

  /**
   * Callers must throttle first (LoginThrottle), since this does not limit attempts itself.
   * @returns undefined for an unknown user or a wrong password, without saying which
   * @throws BusyError when too many hashes are already queued
   */
  async login(username: string, password: string): Promise<{ user: AuthUser; token: string } | undefined> {
    const row = this.users.findByName(username)
    const valid = await this.hasher.verify(password, row?.password_hash ?? await this.dummyHash)
    if (!row || !valid) return undefined
    return { user: { id: row.id, username: row.username }, token: this.sessions.create(row.id) }
  }

  /** for open connections: checks without extending, so an idle open tab doesn't keep a session alive forever */
  isValid(token: string) {
    return this.sessions.isValid(token)
  }

  /** the user behind a session token, if the session is valid; may extend the session (see SessionService.resolve) */
  authenticate(token: string): AuthSession | undefined {
    const session = this.sessions.resolve(token)
    const row = session && this.users.findById(session.userId)
    return row && { user: { id: row.id, username: row.username }, renewed: session.renewed }
  }

  /** ends the session behind the token; unknown tokens are ignored */
  logout(token: string) {
    this.sessions.revoke(token)
  }

  /**
   * Every session of the user ends, including on other devices; the caller gets a fresh one.
   * Hash, update and revocation share one transaction, so a crash can't leave the new password with old sessions alive.
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
}
