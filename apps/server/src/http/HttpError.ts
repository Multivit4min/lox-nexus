/** An error with an HTTP status; the message is sent to the client, so it must not leak internals. */
export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }

  static notFound(what: string) {
    return new HttpError(404, `${what} not found`)
  }

  /** for domain rules such as a taken slug or a target that already has a wire */
  static conflict(message: string) {
    return new HttpError(409, message)
  }

  static badRequest(message: string) {
    return new HttpError(400, message)
  }

  /**
   * Turns a rule violation from core or loxone ("slug already used", "target already has a wire")
   * into a 409. Those are plain Errors; subclasses (TypeError, ZodError) and errors with a code
   * (SQLite, system errors) are bugs or infrastructure problems and stay 400/500.
   */
  static fromDomain(error: unknown): unknown {
    if (!(error instanceof Error) || error.constructor !== Error || "code" in error) return error
    return HttpError.conflict(error.message)
  }
}
