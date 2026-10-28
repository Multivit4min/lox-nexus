import assert from "node:assert/strict"
import { after, afterEach, before, mock, test } from "node:test"
import { InfluxHarness, type InfluxHost } from "./test-support/InfluxHarness.ts"

const { numbers, logs } = InfluxHarness

let harness: InfluxHarness
before(async () => (harness = await InfluxHarness.create()))
afterEach(async () => {
  await harness.cleanup()
  harness.influx.requests.length = 0
})
after(() => harness.close())

async function turns(count = 20) {
  for (let i = 0; i < count; i++) await new Promise<void>(resolve => setImmediate(resolve))
}

/** asserts that nothing is sent `ms - 1` after now, and the next request comes at `ms` */
async function retriedAfter(host: InfluxHost, ms: number) {
  const before = harness.influx.requests.length
  mock.timers.tick(ms - 1)
  await turns()
  assert.equal(harness.influx.requests.length, before, `not before ${ms} ms`)
  mock.timers.tick(1)
  return harness.written(host, before + 1)
}

const options = { timeout: 10_000 }

test("5xx: exponential backoff keeping the batch, degraded until the next success", options, async () => {
  harness.clock()
  harness.influx.answer({ status: 500, body: "{\"message\":\"internal\"}" }, { status: 502 }, { status: 500 })
  const host = await harness.start({ batchSize: 1 })
  await numbers(host, [1])
  const first = await harness.written(host, 1)
  assert.deepEqual(host.status, { status: "degraded", message: "HTTP 500: {\"message\":\"internal\"}" })
  assert.match(host.plugin.stats.state, /^retrying in 1 s/)
  await numbers(host, [2])
  assert.deepEqual((await retriedAfter(host, 1000)).lines, first.lines, "the same batch, not the new value")
  assert.deepEqual((await retriedAfter(host, 2000)).lines, first.lines)
  assert.deepEqual((await retriedAfter(host, 4000)).lines, first.lines)
  assert.equal(host.status.status, "running")
  await harness.written(host, 5)
  assert.match(harness.influx.requests[4]?.body ?? "", /value=2 /, "then what came meanwhile")
  assert.equal(host.plugin.stats.written, 2)
  assert.ok(logs(host, "info").includes("InfluxDB answers again"))
})

test("a network error is retried with backoff and says unreachable", options, async () => {
  harness.clock()
  harness.influx.answer("drop")
  const host = await harness.start({ batchSize: 1 })
  await numbers(host, [1])
  await harness.written(host, 1)
  assert.equal(host.status.status, "degraded")
  assert.match(host.status.message ?? "", /^InfluxDB unreachable: /)
  await retriedAfter(host, 1000)
  assert.deepEqual([host.status.status, host.plugin.stats.written], ["running", 1])
})

test("429 and 503 wait as long as Retry-After says (seconds or a date); 429 isn't degraded", options, async () => {
  harness.clock()
  harness.influx.answer(
    { status: 429, headers: { "retry-after": "30" } },
    { status: 503, headers: { "retry-after": new Date(InfluxHarness.NOW + 30_000 + 120_000).toUTCString() } }
  )
  const host = await harness.start({ batchSize: 1 })
  await numbers(host, [1])
  await harness.written(host, 1)
  assert.equal(host.status.status, "running", "rate limiting is normal operation")
  assert.match(host.plugin.stats.state, /^retrying in 30 s/)
  await retriedAfter(host, 30_000)
  assert.equal(host.status.status, "degraded")
  await retriedAfter(host, 120_000)
  assert.deepEqual([host.status.status, host.plugin.stats.written], ["running", 1])
})

test("400: the batch is dropped as rejected, the body logged, and writing goes on", options, async () => {
  harness.clock()
  const body = `{"code":"invalid","message":"partial write: field type conflict ${"x".repeat(1000)}"}`
  harness.influx.answer({ status: 400, body })
  const host = await harness.start({ batchSize: 2 })
  await numbers(host, [1, 2])
  await harness.written(host, 1)
  const warning = logs(host, "warn").find(line => line.startsWith("InfluxDB rejected 2 points"))
  assert.ok(warning?.includes("field type conflict"), "the reason is logged")
  assert.ok((warning ?? "").length < 700, "the body is truncated")
  assert.deepEqual([host.plugin.stats.rejected, host.plugin.buffer.size, host.status.status], [2, 0, "running"])
  await numbers(host, [3, 4])
  assert.match((await harness.written(host, 2)).body, /value=3 /)
  assert.equal(host.plugin.stats.written, 2)
})

test("401: degraded as unauthorized, keeps buffering, retries every minute and recovers", options, async () => {
  harness.clock()
  harness.influx.answer({ status: 401, body: "{\"code\":\"unauthorized\"}" }, { status: 403 })
  const host = await harness.start({ batchSize: 1 })
  await numbers(host, [1])
  await harness.written(host, 1)
  assert.match(host.status.message ?? "", /^unauthorized \(HTTP 401\), check the token/)
  await numbers(host, [2, 3])
  assert.equal(host.plugin.buffer.size, 3, "still buffering")
  await retriedAfter(host, 60_000)
  assert.match(host.status.message ?? "", /^unauthorized \(HTTP 403\)/)
  await retriedAfter(host, 60_000)
  await harness.written(host, 5)
  assert.deepEqual([host.status.status, host.plugin.stats.written, host.plugin.buffer.size], ["running", 3, 0])
})

test("404: degraded as bucket or database not found, and the message names the user and password on v1", options, async () => {
  harness.clock()
  harness.influx.answer({ status: 404, body: "{\"error\":\"database not found: \\\"loxone\\\"\"}" }, { status: 401 })
  const host = await harness.start({ api: "v1", database: "loxone", batchSize: 1 })
  await numbers(host, [1])
  await harness.written(host, 1)
  assert.match(host.status.message ?? "", /^bucket or database not found \(HTTP 404\): .*database not found/)
  await retriedAfter(host, 60_000)
  assert.match(host.status.message ?? "", /check the user and password/)
})
