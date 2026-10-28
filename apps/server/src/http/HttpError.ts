import { DomainError } from "@lox-nexus/core"

/** An error with an HTTP status; the message is sent to the client, so it must not leak internals. */
export class HttpError extends Error {
  /**
   * @param status the HTTP status code to answer with
   * @param code machine-readable, sent along with the message (a DomainError's code)
   */
  constructor(readonly status: number, message: string, readonly code?: string) {
    super(message)
  }

  /** 404 with the message `<what> not found` */
  static notFound(what: string) {
    return new HttpError(404, `${what} not found`)
  }

  /** 409, for domain rules such as a taken slug or a target that already has a wire */
  static conflict(message: string) {
    return new HttpError(409, message)
  }

  /** 400 */
  static badRequest(message: string) {
    return new HttpError(400, message)
  }

  /**
   * Turns a rule violation from core or loxone (a DomainError: "slug already used", "target already
   * has a wire") into a 409 with its code. Anything else (TypeError, ZodError, SQLite and system
   * errors) is a bug or an infrastructure problem and is returned as it is.
   */
  static fromDomain(error: unknown): unknown {
    return error instanceof DomainError ? new HttpError(409, error.message, error.code) : error
  }
}
