import type { PasswordReset } from "../auth/PasswordReset.ts"

/** Where the new password comes from: a person at a terminal, or piped input. */
export interface PasswordSource {
  /** a person types it, so it is asked twice */
  readonly interactive: boolean
  /** @throws Error when cancelled or the input ends */
  read(prompt: string): Promise<string>
}

/** Where the command reports; injectable for tests. */
export interface CommandOutput {
  info(message: string): void
  error(message: string): void
}

/**
 * `npm run reset-password [-- <username>]`: checks the account first (the only one if there is
 * just one), then reads the new password (twice at a terminal) and resets it.
 */
export class ResetPasswordCommand {
  constructor(
    private readonly reset: Pick<PasswordReset, "account" | "check" | "reset">,
    private readonly source: PasswordSource,
    private readonly out: CommandOutput
  ) {}

  /** @returns the process exit code */
  async run(args: string[]): Promise<number> {
    try {
      const [named, extra] = args.filter(arg => arg !== "--")
      if (extra !== undefined) throw new Error("usage: npm run reset-password [-- <username>]")
      const account = this.reset.account(named)
      const password = await this.source.read(`New password for "${account}" (at least 8 characters): `)
      this.reset.check(password)
      if (this.source.interactive && await this.source.read("Repeat it: ") !== password) {
        throw new Error("the two passwords differ; nothing was changed")
      }
      await this.reset.reset(account, password)
      this.out.info(`The password of "${account}" is changed, and all of its sessions are signed out.`)
      return 0
    } catch (error) {
      this.out.error(error instanceof Error ? error.message : String(error))
      return 1
    }
  }
}
