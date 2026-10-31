/** a user who has as many access tokens as allowed */
export class TooManyTokensError extends Error {
  constructor(max: number) {
    super(`at most ${max} access tokens per user; revoke one first`)
    this.name = "TooManyTokensError"
  }
}
