import assert from "node:assert/strict"
import { after, afterEach, before, mock, test } from "node:test"
import { FakeInflux } from "./test-support/FakeInflux.ts"
import { InfluxHarness, type InfluxHost } from "./test-support/InfluxHarness.ts"

const { numbers, logs } = InfluxHarness

let harness: InfluxHarness
let elsewhere: FakeInflux
before(async () => {
  harness = await InfluxHarness.create()
  elsewhere = await FakeInflux.start()
})
afterEach(async () => {
  await harness.cleanup()
  harness.influx.requests.length = 0
  harness.influx.checks.length = 0
  harness.influx.health = { status: 200 }
})
after(async () => {
  await harness.close()
  await elsewhere.close()
})

async function turns(count = 20) {
  for (let i = 0; i < count; i++) await new Promise<void>(resolve => setImmediate(resolve))
}

/** waits on real event-loop turns until the status is degraded (the start check runs in the background) */
async function degraded(host: InfluxHost, ms = 2000) {
  const start = performance.now()
  while (host.status.status !== "degraded") {
    if (performance.now() - start > ms) throw new Error("not degraded")
    await new Promise<void>(resolve => setImmediate(resolve))
  }
}

const options = { timeout: 10_000 }

test("a redirect isn't followed: the token never goes to the other server, and the user is told", options, async () => {
  harness.clock()
  harness.influx.answer({ status: 307, headers: { location: `${elsewhere.url}/api/v2/write` } })
  const host = await harness.start({ batchSize: 1 })
  await numbers(host, [1])
  await harness.written(host, 1)
  await turns()
  assert.deepEqual([elsewhere.requests.length, elsewhere.checks.length], [0, 0])
  assert.match(host.status.message ?? "", new RegExp(`^redirected \\(HTTP 307\\) to ${elsewhere.url}/api/v2/write; set the URL to it`))
  mock.timers.tick(59_999)
  await turns()
  assert.equal(harness.influx.requests.length, 1, "retried slowly")
})

test("a request that hangs times out and is retried", options, async () => {
  harness.clock()
  harness.influx.answer("hang")
  const host = await harness.start({ batchSize: 1 })
  await numbers(host, [1])
  await harness.influx.received(1)
  mock.timers.tick(14_999)
  await turns()
  assert.equal(host.status.status, "running")
  mock.timers.tick(1)
  await host.plugin.writer.settled()
  assert.deepEqual(host.status, { status: "degraded", message: "InfluxDB unreachable: timed out" })
  mock.timers.tick(1000)
  await harness.written(host, 2)
  assert.deepEqual([host.status.status, host.plugin.stats.written], ["running", 1])
})

test("413: the batch is halved and sent at once, and later batches stay that small", options, async () => {
  harness.clock()
  harness.influx.answer({ status: 413 })
  const host = await harness.start({ batchSize: 4 })
  await numbers(host, [1, 2, 3, 4, 5, 6])
  await harness.written(host, 4)
  assert.deepEqual(harness.influx.requests.map(r => r.lines.length), [4, 2, 2, 2])
  assert.deepEqual(harness.influx.lines.slice(4).map(line => /value=(\d+)/.exec(line)?.[1]), ["1", "2", "3", "4", "5", "6"], "in order")
  assert.ok(logs(host, "warn").some(line => line.includes("batch too large (HTTP 413); lower the batch size")))
  assert.deepEqual([host.status.status, host.plugin.stats.written, host.plugin.stats.rejected, host.plugin.buffer.size], ["running", 6, 0, 0])
})

test("413 for a single point rejects it", options, async () => {
  harness.influx.answer({ status: 413 })
  const host = await harness.start({ batchSize: 1 })
  await numbers(host, [1])
  await harness.written(host, 1)
  assert.equal(host.plugin.stats.rejected, 1)
})

test("a rejection while degraded clears it; rejection warnings come at most once a minute", options, async () => {
  harness.clock()
  harness.influx.answer({ status: 401 }, { status: 400, body: "bad" }, { status: 400 }, { status: 400 })
  const host = await harness.start({ batchSize: 1 })
  await numbers(host, [1])
  await harness.written(host, 1)
  mock.timers.tick(60_000)
  await harness.written(host, 2)
  assert.deepEqual([host.status.status, host.plugin.stats.state], ["running", "ok, the last batch was rejected"])
  await numbers(host, [2])
  await harness.written(host, 3)
  mock.timers.tick(60_000)
  await numbers(host, [3])
  await harness.written(host, 4)
  const rejections = logs(host, "warn").filter(line => line.startsWith("InfluxDB rejected"))
  assert.equal(rejections.length, 2)
  assert.match(rejections[1] ?? "", /\(1 more batches were rejected since the last warning\)$/)
})

test("the start checks /health with the token (v2) or /ping (v1)", options, async () => {
  await harness.start()
  await harness.start({ api: "v1", database: "loxone", username: "nexus", password: "pw" })
  while (harness.influx.checks.length < 2) await turns(1)
  const paths = harness.influx.checks.map(check => [check.path, check.headers.authorization?.split(" ")[0]])
  assert.deepEqual(paths.sort(), [["/health", "Token"], ["/ping", "Basic"]])
})

test("a failing start check degrades the instance, but doesn't fail the start", options, async () => {
  harness.clock()
  const closed = await FakeInflux.start()
  const url = closed.url
  await closed.close()
  const unreachable = await harness.start({ url })
  await degraded(unreachable)
  assert.match(unreachable.status.message ?? "", /^check failed: InfluxDB unreachable: ECONNREFUSED/)
  harness.influx.health = { status: 404, body: "404 page not found" }
  const wrong = await harness.start()
  await degraded(wrong)
  assert.equal(wrong.status.message, "check failed: HTTP 404: 404 page not found")
  await numbers(wrong, [1])
  mock.timers.tick(5000)
  await harness.written(wrong, 1)
  assert.equal(wrong.status.status, "running", "the first write clears it")
})
