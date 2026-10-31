import { randomUUID } from "node:crypto"
import type { UserDto } from "@lox-nexus/api"
import type { Clock } from "@lox-nexus/plugin-sdk"
import type { PasswordHasher } from "../auth/PasswordHasher.ts"
import type { SessionService } from "../auth/SessionService.ts"
import type { Database } from "../db/Database.ts"
import type { UserRepository } from "../db/repositories/UserRepository.ts"
import { HttpError } from "../http/HttpError.ts"

/**
 * The accounts on the users page: list, add, delete, and set another user's password. Every
 * account may do everything (no roles). The changes ask for the acting user's own password
 * again, so a browser left logged in isn't enough to add an account or take one over; callers
 * throttle like logins. Nobody deletes themselves or the last account, so the installation can't
 * be locked out from the UI.
 */
export class UserService {
  constructor(
    private readonly db: Database,
    private readonly users: UserRepository,
    private readonly sessions: Pick<SessionService, "revokeAll">,
    private readonly hasher: Pick<PasswordHasher, "hash" | "verify">,
    private readonly clock: Pick<Clock, "now">,
    private readonly log: (message: string) => void = () => {}
  ) {}

  list(you: string): UserDto[] {
    return this.users.list().map(row => ({
      id: row.id, username: row.username, createdAt: row.created_at, you: row.id === you,
      ...(row.last_login_at ? { lastLoginAt: row.last_login_at } : {})
    }))
  }

  /** @throws HttpError 403 wrong own password, 409 the name is taken (ignoring case) */
  async create(actor: string, currentPassword: string, username: string, password: string): Promise<UserDto> {
    const by = await this.reauthenticate(actor, currentPassword)
    if (this.users.findByName(username)) throw HttpError.conflict(`there is already a user named "${username}"`)
    const hash = await this.hasher.hash(password)
    const row = { id: randomUUID(), username, password_hash: hash, created_at: this.clock.now() }
    this.db.transaction(() => {
      if (this.users.findByName(username)) throw HttpError.conflict(`there is already a user named "${username}"`)
      this.users.insert(row)
    })
    this.log(`user "${username}" added by ${by}`)
    return { id: row.id, username, createdAt: row.created_at, you: false }
  }

  /** their sessions end with them. @throws HttpError 403 wrong own password, 404 unknown, 409 yourself or the last account */
  async remove(actor: string, currentPassword: string, id: string) {
    const by = await this.reauthenticate(actor, currentPassword)
    if (id === actor) throw HttpError.conflict("you can't delete your own account; another user can")
    const target = this.target(id)
    this.db.transaction(() => {
      if (this.users.count() <= 1) throw HttpError.conflict("the last account can't be deleted")
      this.users.delete(id)
    })
    this.log(`user "${target.username}" deleted by ${by}`)
  }

  /**
   * Sets another user's password and ends all their sessions (and, with access tokens, their
   * tokens). Your own goes through the password change, which keeps your session.
   * @throws HttpError 400 yourself, 403 wrong own password, 404 unknown
   */
  async setPassword(actor: string, currentPassword: string, id: string, password: string) {
    if (id === actor) throw HttpError.badRequest("change your own password with Change password")
    const by = await this.reauthenticate(actor, currentPassword)
    const target = this.target(id)
    const hash = await this.hasher.hash(password)
    this.db.transaction(() => {
      this.users.updatePassword(id, hash)
      this.sessions.revokeAll(id)
    })
    this.log(`password of user "${target.username}" set by ${by}`)
  }

  // the acting user's own password, checked again; @returns their name for the log
  private async reauthenticate(actor: string, password: string) {
    const row = this.users.findById(actor)
    if (!row || !(await this.hasher.verify(password, row.password_hash))) throw new HttpError(403, "your password is wrong")
    return row.username
  }

  private target(id: string) {
    const row = this.users.findById(id)
    if (!row) throw HttpError.notFound(`user "${id}"`)
    return row
  }
}
