import type { FastifyError, FastifyReply, FastifyRequest } from "fastify"
import { z } from "zod"
import { BusyError } from "../auth/ConcurrencyLimit.ts"
import { SetupDoneError } from "../auth/SetupDoneError.ts"
import { HttpError } from "./HttpError.ts"

/**
 * Maps errors to JSON responses: { error, issues?, code? } (`code` for domain rule violations). Unexpected errors are logged and answered
 * with a generic 500, so stack traces and SQL never reach the client.
 *
 * Status mapping: ZodError 400 (with issues), HttpError its own status, SetupDoneError 409,
 * BusyError 503 with Retry-After, SQLite constraint violation 409, Fastify's own 4xx (bad JSON,
 * wrong content type, body too large) passed through, everything else 500.
 */
export class ErrorHandler {
  // SQLite's primary result code for constraint violations (unique, foreign key)
  private static readonly SQLITE_CONSTRAINT = 19

  /** installed as Fastify's error handler */
  readonly handle = (error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof z.ZodError) {
      return reply.code(400).send({ error: z.prettifyError(error), issues: error.issues })
    }
    if (error instanceof HttpError) return reply.code(error.status).send({ error: error.message, ...(error.code ? { code: error.code } : {}) })
    if (error instanceof SetupDoneError) return reply.code(409).send({ error: error.message })
    if (error instanceof BusyError) return reply.code(503).header("retry-after", 1).send({ error: error.message })
    if (ErrorHandler.isConstraint(error)) return reply.code(409).send({ error: "conflicts with existing data" })
    const status = "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 500
    // Fastify's own 4xx errors (bad JSON, wrong content type) are safe to pass on
    if (status < 500) return reply.code(status).send({ error: error.message })
    request.log.error({ err: error }, "request failed")
    return reply.code(500).send({ error: "internal error" })
  }

  /** a SQLite constraint violation (unique, foreign key); node:sqlite reports the extended result code in errcode, the low byte is the primary code */
  static isConstraint(error: unknown) {
    if (!(error instanceof Error)) return false
    const code = (error as { errcode?: unknown }).errcode
    return typeof code === "number" && (code & 0xff) === ErrorHandler.SQLITE_CONSTRAINT
  }
}
