import type { WriteResult } from "./WriteEndpoint.ts"

/** What to do with a batch after a write attempt. */
export type Outcome =
  | { kind: "ok" }
  /** InfluxDB refused the data itself: retrying can't help, the batch is dropped */
  | { kind: "reject"; reason: string }
  /** keep the batch and try again after `delayMs`; `degraded` is the status message, if any */
  | { kind: "retry"; delayMs: number; reason: string; degraded?: string }
  /** the batch was too large (413): send its first half right away, the rest after it */
  | { kind: "split"; reason: string; degraded: string }

/**
 * Decides what happens after a write:
 *
 * | Answer | Outcome |
 * |---|---|
 * | 2xx | ok |
 * | 429, 503 with Retry-After | retry when the server says (1 s to 10 min) |
 * | 401, 403, 404, 3xx | degraded; retry every minute, as this needs the user to act |
 * | 408, other 429 and 5xx, network error, timeout | degraded unless 429; exponential backoff 1 s to 60 s |
 * | 413 | degraded; the batch is split in half and sent again right away (rejected once it is one point) |
 * | 400 and other 4xx | reject: the data is wrong (bad line, field type conflict, beyond retention) |
 *
 * Reasons never quote a request: a fetch that fails before sending says so in fixed words.
 */
export class RetryPolicy {
  static readonly FIRST_MS = 1000
  static readonly MAX_BACKOFF_MS = 60_000
  static readonly SLOW_MS = 60_000
  static readonly MAX_RETRY_AFTER_MS = 600_000
  /** characters of a Location header quoted in a status message */
  static readonly LOCATION_LIMIT = 200
  /** said instead of the message of a request that couldn't be built, which may quote a header */
  static readonly INVALID_REQUEST = "invalid request (check the URL and credentials)"

  private failures = 0

  /** @param credentials what to check on 401/403, e.g. "the token" */
  constructor(private readonly credentials: string) {}

  /** the next backoff delay, in ms */
  get nextBackoff() {
    return Math.min(RetryPolicy.FIRST_MS * 2 ** this.failures, RetryPolicy.MAX_BACKOFF_MS)
  }

  /** @param points of the batch, to know whether a 413 can still be split */
  answer(result: WriteResult, now = Date.now(), points = 1): Outcome {
    const { status } = result
    const said = result.body ? `: ${result.body}` : ""
    if (status >= 200 && status < 300) {
      this.failures = 0
      return { kind: "ok" }
    }
    if (status === 401 || status === 403) return this.slow(`unauthorized (HTTP ${status}), check ${this.credentials}${said}`)
    if (status === 404) return this.slow(`bucket or database not found (HTTP 404)${said}`)
    if (status >= 300 && status < 400) return this.slow(`redirected (HTTP ${status}) to ${RetryPolicy.location(result)}; set the URL to it`)
    if (status === 413 && points > 1) {
      const reason = "batch too large (HTTP 413); lower the batch size"
      return { kind: "split", reason, degraded: reason }
    }
    const waitMs = status === 429 || status === 503 ? RetryPolicy.retryAfter(result.retryAfter, now) : undefined
    if (waitMs !== undefined) return this.retry(waitMs, `HTTP ${status}, retrying when the server asked`, status === 503)
    if (status === 408 || status === 429 || status >= 500) return this.retry(this.backoff(), `HTTP ${status}${said}`, status !== 429)
    this.failures = 0
    return { kind: "reject", reason: `HTTP ${status}${said}` }
  }

  /** a request that failed without an answer: unreachable, reset, timed out */
  error(error: unknown): Outcome {
    return this.retry(this.backoff(), `InfluxDB unreachable: ${RetryPolicy.describe(error)}`, true)
  }

  /** milliseconds from a Retry-After header (seconds or an HTTP date), clamped; undefined if unusable */
  static retryAfter(header: string | undefined, now: number): number | undefined {
    if (header === undefined || header.trim() === "") return undefined
    const seconds = Number(header)
    const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now
    if (Number.isNaN(ms)) return undefined
    return Math.min(Math.max(ms, RetryPolicy.FIRST_MS), RetryPolicy.MAX_RETRY_AFTER_MS)
  }

  /**
   * A short reason for a failed fetch: "ECONNREFUSED", "timed out", … A TypeError without a cause
   * comes from building the request, and its message may quote a header, the token included.
   */
  static describe(error: unknown): string {
    if (!(error instanceof Error)) return "unknown error"
    if (error.name === "TimeoutError") return "timed out"
    if (error.name === "AbortError") return "aborted"
    const cause = error.cause
    if (cause instanceof Error) return "code" in cause && typeof cause.code === "string" ? cause.code : cause.message
    return error instanceof TypeError ? RetryPolicy.INVALID_REQUEST : error.message
  }

  private static location(result: WriteResult) {
    const location = result.location ?? "another address"
    return location.length > RetryPolicy.LOCATION_LIMIT ? `${location.slice(0, RetryPolicy.LOCATION_LIMIT)}…` : location
  }

  private backoff() {
    const ms = this.nextBackoff
    this.failures++
    return ms
  }

  private slow(reason: string): Outcome {
    this.failures++
    return { kind: "retry", delayMs: RetryPolicy.SLOW_MS, reason, degraded: reason }
  }

  private retry(delayMs: number, reason: string, degrade: boolean): Outcome {
    return degrade ? { kind: "retry", delayMs, reason, degraded: reason } : { kind: "retry", delayMs, reason }
  }
}
