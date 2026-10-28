import assert from "node:assert/strict"
import { test } from "node:test"
import { RetryPolicy } from "./RetryPolicy.ts"

const now = Date.parse("2026-11-02T08:00:00Z")

test("backoff doubles from 1 s to at most 60 s and starts over after a success", () => {
  const policy = new RetryPolicy("the token")
  const delays = Array.from({ length: 8 }, () => policy.error(new Error("x")))
    .map(outcome => (outcome.kind === "retry" ? outcome.delayMs / 1000 : -1))
  assert.deepEqual(delays, [1, 2, 4, 8, 16, 32, 60, 60])
  assert.deepEqual(policy.answer({ status: 204, body: "" }), { kind: "ok" })
  assert.equal(policy.nextBackoff, 1000)
})

test("Retry-After in seconds or as a date, clamped to 1 s to 10 min; garbage falls back to backoff", () => {
  assert.equal(RetryPolicy.retryAfter("30", now), 30_000)
  assert.equal(RetryPolicy.retryAfter("0", now), 1000)
  assert.equal(RetryPolicy.retryAfter("86400", now), 600_000)
  assert.equal(RetryPolicy.retryAfter(new Date(now + 120_000).toUTCString(), now), 120_000)
  assert.equal(RetryPolicy.retryAfter("soon", now), undefined)
  assert.equal(RetryPolicy.retryAfter(undefined, now), undefined)
  const policy = new RetryPolicy("the token")
  assert.deepEqual(policy.answer({ status: 429, retryAfter: "soon", body: "" }, now), { kind: "retry", delayMs: 1000, reason: "HTTP 429" })
})

test("each answer gets its outcome", () => {
  const outcome = (status: number, extra = {}) => new RetryPolicy("the token").answer({ status, body: "why", ...extra }, now)
  assert.deepEqual(outcome(200), { kind: "ok" })
  assert.deepEqual(outcome(400), { kind: "reject", reason: "HTTP 400: why" })
  assert.deepEqual(outcome(422), { kind: "reject", reason: "HTTP 422: why" }, "beyond the retention period")
  assert.match(String((outcome(401) as { degraded?: string }).degraded), /^unauthorized \(HTTP 401\), check the token/)
  assert.match(String((outcome(403) as { degraded?: string }).degraded), /^unauthorized/)
  assert.deepEqual(outcome(404), { kind: "retry", delayMs: 60_000, reason: "bucket or database not found (HTTP 404): why", degraded: "bucket or database not found (HTTP 404): why" })
  assert.match(String((outcome(301, { location: "https://influx/" }) as { degraded?: string }).degraded), /redirected \(HTTP 301\) to https:\/\/influx\//)
  assert.deepEqual(outcome(503, { retryAfter: "5" }), { kind: "retry", delayMs: 5000, reason: "HTTP 503, retrying when the server asked", degraded: "HTTP 503, retrying when the server asked" })
  assert.deepEqual(outcome(429, { retryAfter: "5" }), { kind: "retry", delayMs: 5000, reason: "HTTP 429, retrying when the server asked" }, "rate limiting isn't degraded")
  assert.deepEqual(outcome(502), { kind: "retry", delayMs: 1000, reason: "HTTP 502: why", degraded: "HTTP 502: why" })
  assert.deepEqual(outcome(408), { kind: "retry", delayMs: 1000, reason: "HTTP 408: why", degraded: "HTTP 408: why" })
})

test("network errors are described by their code", () => {
  const refused = new TypeError("fetch failed", { cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }) })
  assert.equal(RetryPolicy.describe(refused), "ECONNREFUSED")
  assert.equal(RetryPolicy.describe(new DOMException("timeout", "TimeoutError")), "timed out")
  assert.equal(RetryPolicy.describe(new DOMException("aborted", "AbortError")), "aborted")
  assert.equal(RetryPolicy.describe("weird"), "unknown error")
})

test("a request that couldn't be built is described in fixed words, never with its message", () => {
  const token = "s3cret\ntoken"
  const invalid = new TypeError(`Headers.append: "Token ${token}" is an invalid header value.`)
  assert.equal(RetryPolicy.describe(invalid), RetryPolicy.INVALID_REQUEST)
  const outcome = new RetryPolicy("the token").error(invalid)
  assert.equal(JSON.stringify(outcome).includes("s3cret"), false)
})

test("413 splits while the batch has more than one point, then rejects", () => {
  const policy = new RetryPolicy("the token")
  const reason = "batch too large (HTTP 413); lower the batch size"
  assert.deepEqual(policy.answer({ status: 413, body: "" }, now, 10), { kind: "split", reason, degraded: reason })
  assert.deepEqual(policy.answer({ status: 413, body: "" }, now, 1), { kind: "reject", reason: "HTTP 413" })
})

test("a long redirect location is cut", () => {
  const outcome = new RetryPolicy("the token").answer({ status: 307, location: `https://x/${"a".repeat(1000)}`, body: "" }, now)
  assert.ok(outcome.kind === "retry" && outcome.reason.length < 300, "cut to 200 characters")
})
