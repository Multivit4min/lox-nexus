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

  /** turns a domain error (plain Error from core or loxone) into a 409 with its message */
  static fromDomain(error: unknown): unknown {
    if (error instanceof HttpError || !(error instanceof Error) || error.name === "ZodError") return error
    return HttpError.conflict(error.message)
  }
}
