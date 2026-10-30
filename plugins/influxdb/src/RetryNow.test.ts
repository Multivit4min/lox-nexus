import assert from "node:assert/strict"
import { after, afterEach, before, test } from "node:test"
import { InfluxHarness } from "./test-support/InfluxHarness.ts"

const { numbers } = InfluxHarness

let harness: InfluxHarness
before(async () => (harness = await InfluxHarness.create()))
afterEach(async () => {
  await harness.cleanup()
  harness.influx.requests.length = 0
})
after(() => harness.close())

test("Retry now sends the waiting batch at once instead of after the delay; its button is in the Export section", { timeout: 10_000 }, async () => {
  harness.clock()
  harness.influx.answer({ status: 401, body: "unauthorized" })
  const host = await harness.start({ batchSize: 1 })
  await numbers(host, [1])
  await harness.written(host, 1)
  assert.match(host.plugin.stats.state, /^retrying in/)
  assert.equal(await host.action("retry-now"), "Writing the waiting points now; the Export section shows how it went")
  await harness.written(host, 2)
  assert.equal(host.plugin.stats.written, 1, "written right away, the delay not waited for")
  assert.equal(await host.action("retry-now"), "No write is waiting for a retry")
  const panel = await host.panel()
  assert.ok(panel?.type === "sections" && panel.sections[0]?.actions?.[0]?.action === "retry-now")
})
