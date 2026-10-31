import { z, ZodError } from "zod"
import { HttpError } from "../http/HttpError.ts"

/** What of an error the model may read: a service's own refusal, or zod's issues; never a stack or a database message. */
export class Refusals {
  /** undefined for an unexpected failure, which is logged instead */
  static reason(error: unknown) {
    if (error instanceof HttpError && (error.status < 500 || error.status === 503)) return error.message
    if (error instanceof ZodError) return z.prettifyError(error)
    return undefined
  }

  static readonly UNEXPECTED = "failed unexpectedly; the Nexus log has the details"
}
