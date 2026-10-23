/** A failed API call: the HTTP status and the server's `{ error, issues? }` body. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** zod issues for a 400, so forms can show them next to the field */
    readonly issues: Array<{ path: PropertyKey[]; message: string }> = []
  ) {
    super(message)
  }

  get isUnauthorized() {
    return this.status === 401
  }

  /** the first issue message for a field path such as "listenPort" */
  issueFor(field: string) {
    return this.issues.find(issue => issue.path.join(".") === field)?.message
  }
}
