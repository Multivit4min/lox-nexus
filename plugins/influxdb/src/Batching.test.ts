import assert from "node:assert/strict"
import { after, afterEach, before, mock, test } from "node:test"
import { InfluxHarness } from "./test-support/InfluxHarness.ts"

const { numbers } = InfluxHarness

let harness: InfluxHarness
before(async () => (harness = await InfluxHarness.create()))
afterEach(async () => {
  await harness.cleanup()
  harness.influx.requests.length = 0
})
after(() => harness.close())

/** a few real event-loop turns, so a request that would be sent has reached the fake */
async function turns(count = 20) {
  for (let i = 0; i < count; i++) await new Promise<void>(resolve => setImmediate(resolve))
}

const values = (count: number) => harness.influx.lines.map(line => Number(/value=(\S+)/.exec(line)?.[1])).slice(0, count)

test("a full batch is written right away, the rest at the next interval", { timeout: 10_000 }, async () => {
  harness.clock()
  const host = await harness.start({ batchSize: 3, flushSeconds: 5 })
  await numbers(host, [1, 2])
  await turns()
  assert.equal(harness.influx.requests.length, 0, "two of three: wait")
  await numbers(host, [3, 4])
  assert.equal((await harness.written(host, 1)).lines.length, 3)
  mock.timers.tick(4999)
  await turns()
  assert.equal(harness.influx.requests.length, 1, "the fourth waits for the interval")
  mock.timers.tick(1)
  assert.equal((await harness.written(host, 2)).lines.length, 1)
  assert.deepEqual(values(4), [1, 2, 3, 4], "in order")
  assert.equal(host.plugin.stats.written, 4)
})

test("the interval writes whatever is waiting, and nothing when nothing is", { timeout: 10_000 }, async () => {
  harness.clock()
  const host = await harness.start({ flushSeconds: 10 })
  mock.timers.tick(10_000)
  await turns()
  assert.equal(harness.influx.requests.length, 0)
  await numbers(host, [7])
  mock.timers.tick(9999)
  await turns()
  assert.equal(harness.influx.requests.length, 0)
  mock.timers.tick(1)
  assert.equal((await harness.written(host, 1)).lines.length, 1)
})

test("a backlog larger than a batch is sent batch after batch without waiting", { timeout: 10_000 }, async () => {
  harness.clock()
  harness.influx.answer({ status: 500 })
  const host = await harness.start({ batchSize: 2 })
  await numbers(host, [1, 2])
  await harness.written(host, 1)
  await numbers(host, [3, 4, 5, 6, 7])
  await turns()
  assert.equal(harness.influx.requests.length, 1, "nothing goes while a retry is pending")
  mock.timers.tick(1000)
  await harness.written(host, 4)
  assert.deepEqual(harness.influx.requests.map(r => r.lines.length), [2, 2, 2, 2], "retry, then two more full batches")
  assert.equal(host.plugin.buffer.size, 1, "the last one waits for the interval")
  assert.deepEqual(values(8), [1, 2, 1, 2, 3, 4, 5, 6])
})
