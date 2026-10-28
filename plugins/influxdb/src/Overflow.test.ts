import assert from "node:assert/strict"
import { after, afterEach, before, mock, test } from "node:test"
import { InfluxHarness } from "./test-support/InfluxHarness.ts"

const { numbers, logs } = InfluxHarness

let harness: InfluxHarness
before(async () => (harness = await InfluxHarness.create()))
afterEach(async () => {
  await harness.cleanup()
  harness.influx.requests.length = 0
})
after(() => harness.close())

const range = (from: number, count: number) => Array.from({ length: count }, (_, i) => from + i)

test("a full buffer drops the oldest waiting points, counts them, and keeps the batch being retried", { timeout: 10_000 }, async () => {
  harness.clock()
  harness.influx.answer({ status: 503 })
  const host = await harness.start({ batchSize: 10, maxBufferedPoints: 100 })
  await numbers(host, range(0, 10))
  await harness.written(host, 1)
  await numbers(host, range(10, 150))
  assert.deepEqual([host.plugin.buffer.size, host.plugin.buffer.dropped], [100, 60])
  assert.equal(logs(host, "warn").filter(line => line.startsWith("values are being dropped")).length, 1)
  await numbers(host, range(160, 10))
  assert.equal(host.plugin.buffer.dropped, 70)
  assert.equal(logs(host, "warn").filter(line => line.startsWith("values are being dropped")).length, 1, "at most one warning a minute")
  mock.timers.tick(1000)
  await harness.written(host, 11)
  const written = harness.influx.lines.slice(10).map(line => Number(/value=(\S+) /.exec(line)?.[1]))
  assert.deepEqual(written, [...range(0, 10), ...range(80, 90)], "the retried batch, then the newest 90")
  assert.deepEqual([host.plugin.stats.written, host.plugin.buffer.size], [100, 0])
})

test("values Nexus dropped are counted apart from the buffer's", async () => {
  const host = await harness.start({ batchSize: 1 })
  await numbers(host, [1], 5)
  await numbers(host, [2], 2)
  await harness.written(host, 2)
  assert.deepEqual([host.plugin.stats.droppedByNexus, host.plugin.buffer.dropped], [7, 0])
  assert.ok(logs(host, "warn").some(line => line.startsWith("values are being dropped")))
})
