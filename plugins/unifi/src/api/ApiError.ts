import { z } from "@lox-nexus/plugin-sdk"

// the spec's "Error Message" schema; every field is optional there
const errorMessageSchema = z.looseObject({
  code: z.string().optional(),
  message: z.string().optional(),
  statusName: z.string().optional()
})

/** An HTTP error answer of the API, with the spec's `code` and `message` when it sent them. */
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string | undefined, message: string) {
    super(message)
    this.name = "ApiError"
  }

  /** builds the error from an answer's status and body; a body that isn't JSON is ignored */
  static from(status: number, body: string, what: string) {
    const parsed = errorMessageSchema.safeParse(ApiError.json(body))
    const detail = parsed.success ? parsed.data.message ?? parsed.data.statusName : undefined
    const code = parsed.success ? parsed.data.code : undefined
    return new ApiError(status, code, ApiError.text(status, detail, what))
  }

  /** whether the console refused the key: a restart doesn't help, the user must fix it */
  get refusedKey() {
    return this.status === 401 || this.status === 403
  }

  private static text(status: number, detail: string | undefined, what: string) {
    // the console's own words, clipped: they end up in the panel, whose cells take 1000 characters
    const clipped = detail && detail.length > 300 ? `${detail.slice(0, 299)}…` : detail
    const suffix = clipped ? `: ${clipped}` : ""
    if (status === 401) return `the console refused the API key (HTTP 401${suffix})`
    if (status === 403) return `the API key may not do this (HTTP 403${suffix})`
    if (status === 404) return `${what} not found (HTTP 404${suffix})`
    return `${what} failed with HTTP ${status}${suffix}`
  }

  private static json(body: string): unknown {
    try {
      return JSON.parse(body)
    } catch {
      return undefined
    }
  }
}
