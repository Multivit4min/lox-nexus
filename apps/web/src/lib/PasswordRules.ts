/**
 * The server's rules for a new password (8 to 256 characters), checked in the form together with
 * the repeated entry, so a typo shows before anything is sent rather than at the next login.
 */
export class PasswordRules {
  static readonly MIN = 8
  static readonly MAX = 256

  /** what is wrong with a new password and its repetition, or undefined */
  static problem(password: string, repeat: string): string | undefined {
    if (password.length < PasswordRules.MIN) return `The password needs at least ${PasswordRules.MIN} characters.`
    if (password.length > PasswordRules.MAX) return `The password can have at most ${PasswordRules.MAX} characters.`
    if (password !== repeat) return "The two passwords don't match."
    return undefined
  }
}
