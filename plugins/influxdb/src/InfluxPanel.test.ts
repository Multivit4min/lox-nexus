import assert from "node:assert/strict"
import { after, afterEach, before, test } from "node:test"
import type { Panel, PanelPart } from "@lox-nexus/plugin-sdk"
import { InfluxHarness } from "./test-support/InfluxHarness.ts"

const { numbers } = InfluxHarness

let harness: InfluxHarness
before(async () => (harness = await InfluxHarness.create()))
afterEach(async () => {
  await harness.cleanup()
  harness.influx.requests.length = 0
})
after(() => harness.close())

/** section title → label → value */
function read(panel: Panel | undefined) {
  assert.equal(panel?.type, "sections")
  const sections = panel.type === "sections" ? panel.sections : []
  return Object.fromEntries(sections.map(({ title, panel: part }) => [title, items(part)]))
}

function items(part: PanelPart) {
  return part.type === "keyValue" ? Object.fromEntries(part.items.map(item => [item.label, item.value])) : {}
}

const NOW = new Date(InfluxHarness.NOW).toISOString()

test("before anything happened", async () => {
  harness.clock()
  const host = await harness.start({}, [])
  const { Export, Points } = read(await host.panel())
  assert.deepEqual(Export, {
    "State": "waiting for values",
    "Target": `${harness.influx.url} · org home · bucket loxone`,
    "Watched signals": "none chosen yet",
    "Last success": "never",
    "Last error": "none",
    "Last latency": "–"
  })
  assert.deepEqual(Points, {
    "Written": "0",
    "Buffered": "0 of 25,000",
    "Dropped (buffer full)": "0",
    "Dropped by Nexus (export behind)": "0",
    "Rejected by InfluxDB": "0",
    "Skipped (null or unknown signal)": "0"
  })
})

test("after a success, a rejection and a failure; never the token", async () => {
  harness.clock()
  harness.influx.answer({ status: 204 }, { status: 400, body: "bad line" }, { status: 401 })
  const host = await harness.start({ batchSize: 2 })
  await numbers(host, [1, 2], 3)
  await harness.written(host, 1)
  await host.pushValues([{ signalId: "t1", value: { type: "null" } }])
  await numbers(host, [3, 4])
  await harness.written(host, 2)
  await numbers(host, [5, 6, 7])
  await harness.written(host, 3)
  const panel = await host.panel()
  const { Export, Points } = read(panel)
  assert.equal(Export?.State, "retrying in 60 s: unauthorized (HTTP 401), check the token")
  assert.equal(Export?.["Watched signals"], "2")
  assert.equal(Export?.["Last success"], NOW)
  assert.equal(Export?.["Last error"], `${NOW}: unauthorized (HTTP 401), check the token`)
  assert.match(Export?.["Last latency"] ?? "", /^\d+ ms$/)
  assert.deepEqual(Points, {
    "Written": "2",
    "Buffered": "3 of 25,000",
    "Dropped (buffer full)": "0",
    "Dropped by Nexus (export behind)": "3",
    "Rejected by InfluxDB": "2",
    "Skipped (null or unknown signal)": "1"
  })
  assert.equal(JSON.stringify(panel).includes(InfluxHarness.TOKEN), false)
})

test("the v1 target names the database, retention policy and user, never the password", async () => {
  const host = await harness.start({ api: "v1", database: "loxone", retentionPolicy: "rp1", username: "nexus", password: "hunter2-secret" })
  const panel = await host.panel()
  assert.equal(read(panel).Export?.Target, `${harness.influx.url} · database loxone (rp1) · user nexus`)
  assert.equal(JSON.stringify(panel).includes("hunter2-secret"), false)
})
