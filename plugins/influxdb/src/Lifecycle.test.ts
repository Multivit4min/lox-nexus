import assert from "node:assert/strict"
import { after, afterEach, before, test } from "node:test"
import { InfluxPlugin } from "./InfluxPlugin.ts"
import { InfluxHarness } from "./test-support/InfluxHarness.ts"

const { numbers, logs } = InfluxHarness

let harness: InfluxHarness
before(async () => (harness = await InfluxHarness.create()))
afterEach(async () => {
  await harness.cleanup()
  harness.influx.requests.length = 0
})
after(() => harness.close())

/** resource types active now beyond the baseline (counted per type) */
function added(baseline: string[]) {
  const left = new Map<string, number>()
  for (const type of baseline) left.set(type, (left.get(type) ?? 0) + 1)
  return process.getActiveResourcesInfo().filter(type => {
    const count = left.get(type) ?? 0
    left.set(type, count - 1)
    return count <= 0
  })
}

test("a stop writes what is waiting, and leaves no timers behind", async () => {
  const baseline = process.getActiveResourcesInfo()
  const host = await harness.start({ flushSeconds: 3600 })
  await numbers(host, [1, 2, 3])
  assert.equal(harness.influx.requests.length, 0)
  await harness.stop(host)
  assert.equal(harness.influx.requests.at(-1)?.lines.length, 3)
  assert.equal(logs(host, "warn").length, 0)
  assert.deepEqual(added(baseline).filter(type => type === "Timeout"), [])
})

test("a stop sends every waiting batch, the one being retried first", async () => {
  harness.influx.answer({ status: 500 })
  const host = await harness.start({ batchSize: 2, flushSeconds: 3600 })
  await numbers(host, [1, 2, 3, 4, 5, 6, 7])
  await harness.written(host, 1)
  await harness.stop(host)
  assert.deepEqual(harness.influx.requests.map(request => request.lines.length), [2, 2, 2, 2, 1])
  assert.deepEqual(harness.influx.lines.slice(2).map(line => /value=(\d+)/.exec(line)?.[1]), ["1", "2", "3", "4", "5", "6", "7"])
  assert.equal(logs(host, "warn").filter(line => line.includes("not written")).length, 0)
})

test("a stop while InfluxDB is down gives up after one quick try, quietly, and says what was lost", async () => {
  harness.influx.answer({ status: 500 }, { status: 503 })
  const host = await harness.start({ batchSize: 2 })
  await numbers(host, [1, 2, 3])
  await harness.written(host, 1)
  const warnings = logs(host, "warn").length
  const started = performance.now()
  await harness.stop(host)
  assert.ok(performance.now() - started < InfluxPlugin.CLOSE_MS, "no waiting for the backoff")
  assert.deepEqual(logs(host, "warn").slice(warnings), ["3 points were not written to InfluxDB before the stop"], "no retrying message")
  assert.equal(host.status.message, "HTTP 500", "the stop's own failure doesn't change the status")
})

test("a stop aborts a hanging request without reporting it as a failure", async () => {
  harness.influx.answer("hang")
  const host = await harness.start({ batchSize: 1 })
  await numbers(host, [1])
  await harness.influx.received(1)
  await harness.stop(host)
  assert.equal(host.status.status, "running")
  assert.deepEqual(logs(host, "warn"), ["1 points were not written to InfluxDB before the stop"])
})

test("watching nothing writes nothing", async () => {
  const host = await harness.start({}, [])
  assert.deepEqual(host.plugin.watch.signals(), [])
  await harness.stop(host)
  assert.equal(harness.influx.requests.length, 0)
})
