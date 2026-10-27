import { ChangePasswordSchema } from "@lox-nexus/api"
import type { Database } from "../db/Database.ts"
import type { SessionRepository } from "../db/repositories/SessionRepository.ts"
import type { UserRepository } from "../db/repositories/UserRepository.ts"
import type { PasswordHasher } from "./PasswordHasher.ts"
import { UnknownUserError } from "./UnknownUserError.ts"

/** characters a browser's password field can't produce, e.g. from arrow keys at a terminal */
const isControl = (char: string) => char < " " || char === "\u007f"

/**
 * Sets a new password without knowing the old one, for an operator with shell access to the
 * data directory (the `reset-password` command); having that access is the proof of ownership.
 * Every session of the account ends. Sessions are looked up in the database on every request,
 * so this also works while Nexus is running: the next request of an old session gets a 401, and
 * open live connections close at their next session check.
 */
export class PasswordReset {
  constructor(
    private readonly db: Database,
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly hasher: PasswordHasher
  ) {}

  /**
   * The account to reset, as stored: the named one (matched case-insensitively, like logins) or,
   * without a name, the only one. Checked before asking for a password.
   * @throws UnknownUserError when it doesn't exist, none exists, or several exist and none is named
   */
  account(named?: string) {
    const known = this.users.usernames()
    if (known.length === 0) throw new UnknownUserError("there is no account yet: open the web UI and create one on the setup page")
    if (named !== undefined) {
      const row = this.users.findByName(named)
      if (!row) throw new UnknownUserError(`there is no account "${named}"; accounts: ${known.join(", ")}`)
      return row.username
    }
    if (known.length > 1) throw new UnknownUserError(`several accounts exist (${known.join(", ")}): name one, e.g. npm run reset-password -- ${known[0]}`)
    return known[0]!
  }

  /** @throws Error when the password breaks the UI's rules (8 to 256 characters) or holds control characters */
  check(password: string) {
    if (!ChangePasswordSchema.shape.next.safeParse(password).success) throw new Error("the password needs 8 to 256 characters")
    if (Array.from(password).some(isControl)) throw new Error("the password contains control characters (arrow keys, Esc, …), which a browser can't type")
  }

  /**
   * @param username an account name from account()
   * @throws UnknownUserError, or the errors of check()
   */
  async reset(username: string, password: string) {
    this.check(password)
    const row = this.users.findByName(username)
    if (!row) throw new UnknownUserError(`there is no account "${username}"`)
    const hash = await this.hasher.hash(password)
    this.db.transaction(() => {
      this.users.updatePassword(row.id, hash)
      this.sessions.deleteForUser(row.id)
    })
    return row.username
  }
}
