import assert from "node:assert/strict"
import { afterEach, describe, mock, test } from "node:test"
import type { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { ScriptPanel } from "./ScriptPanel.ts"
import { ScriptHarness } from "./test-support/ScriptHarness.ts"

const script = `
  nexus.set("power", 412.5)
  nexus.set("away", true)
  nexus.set("mode", "eco")
  nexus.on("light", () => {})
  nexus.get("target")
`

/** the table as rows of column → cell */
async function rows(host: PluginTestHost) {
  const panel = await host.panel()
  assert.equal(panel?.type, "table")
  if (panel?.type !== "table") return []
  assert.deepEqual(panel.columns, ScriptPanel.columns)
  return panel.rows.map(row => Object.fromEntries(panel.columns.map((column, i) => [column, row[i]])))
}

describe("catalog and panel", () => {
  const harness = new ScriptHarness()
  afterEach(() => harness.cleanup())

  test("the catalog offers the names the script used, typed by their last value", async () => {
    const host = await harness.start(script)
    await host.addSensor("number", { name: "unused" })
    await host.actuate(await host.addActuator("switch", { name: "light" }), Value.boolean(true))
    assert.deepEqual(await host.catalog(), [
      {
        label: "From the script (nexus.set)",
        entries: [
          { kind: "sensor", capability: "switch", params: { name: "away" }, label: "away", value: Value.boolean(true) },
          { kind: "sensor", capability: "text", params: { name: "mode" }, label: "mode", value: Value.string("eco") },
          { kind: "sensor", capability: "number", params: { name: "power" }, label: "power", value: Value.number(412.5) }
        ]
      },
      {
        label: "To the script (nexus.on, nexus.get)",
        entries: [
          { kind: "actuator", capability: "switch", params: { name: "light" }, label: "light", value: Value.boolean(true) },
          { kind: "actuator", capability: "number", params: { name: "target" }, label: "target" }
        ]
      }
    ])
  })

  test("an empty script has an empty catalog", async () => {
    const host = await harness.start("")
    assert.deepEqual(await host.catalog(), [])
  })

  test("the panel shows the script state, the last error and every variable", async () => {
    mock.timers.enable({ apis: ["Date", "setTimeout", "setInterval"], now: Date.parse("2026-10-28T10:00:00Z") })
    const host = await harness.start(`${script}\nsetInterval(() => {}, 1000)\nnexus.on("fail", () => { throw new Error("nope") })`)
    await host.addSensor("number", { name: "power" })
    await host.addSensor("text", { name: "power" })
    mock.timers.tick(60_000)
    await assert.rejects(host.actuate(await host.addActuator("number", { name: "fail" }), Value.number(1)))
    const [state, error, ...variables] = await rows(host)
    assert.deepEqual(state, {
      Variable: "(script)", Direction: "", Signals: "", "Last value": "running, 1 timer active", Calls: "", "Last call": "2026-10-28T10:00:00.000Z"
    })
    assert.deepEqual(error, {
      Variable: "(last error)", Direction: "", Signals: "", "Last value": "line 9, column 32: nope", Calls: "1", "Last call": "2026-10-28T10:01:00.000Z"
    })
    assert.deepEqual(variables.map(row => [row.Variable, row.Direction, row.Signals, row["Last value"], row.Calls]), [
      ["away", "from script (set)", "0", "true", "1"],
      ["fail", "to script (on, get)", "1", "1", "1"],
      ["light", "to script (on, get)", "0", "", "0"],
      ["mode", "from script (set)", "0", "\"eco\"", "1"],
      ["power", "from script (set)", "2", "412.5", "1"],
      ["target", "to script (on, get)", "0", "", "0"]
    ])
  })

  test("the panel shows a failed top level", async () => {
    const host = await harness.start("throw new Error(\"setup failed\")")
    await ScriptHarness.until(() => host.status.status === "degraded")
    const [state] = await rows(host)
    assert.equal(state?.["Last value"], "running, 0 timers active; top level failed: line 1, column 7: setup failed")
  })

  test("names the script makes up are capped and the cap is logged once", async () => {
    const host = await harness.start("for (let i = 0; i < 1005; i++) nexus.set(\"n\" + i, i)\nnexus.set(\"n1\", -1)")
    const entries = (await host.catalog())[0]?.entries ?? []
    assert.equal(entries.length, 1000)
    assert.deepEqual(entries.find(entry => entry.label === "n1")?.value, Value.number(-1))
    assert.equal(ScriptHarness.logs(host, "warn").filter(line => line.includes("more than 1000 names with nexus.set")).length, 1)
    // a name past the cap was not remembered, so its sensor starts without a value
    const late = await host.addSensor("number", { name: "n1004" })
    assert.deepEqual(host.values(late), [])
  })

  test("the cap is per direction, and nexus.on refuses names past it", async () => {
    const host = await harness.start(`
      for (let i = 0; i < 1000; i++) nexus.set("s" + i, i)
      for (let i = 0; i < 1000; i++) nexus.on("r" + i, () => {})
      nexus.on("r0", () => {})
      try { nexus.on("r1000", () => {}) } catch (error) { nexus.set("s0", error.message) }
    `)
    const [sensors, actuators] = await host.catalog()
    assert.equal(sensors?.entries?.length, 1000)
    assert.equal(actuators?.entries?.length, 1000)
    assert.deepEqual(sensors?.entries?.find(entry => entry.label === "s0")?.value,
      Value.string("nexus.on(\"r1000\"): the script already uses 1000 names for nexus.on and nexus.get"))
    assert.deepEqual(ScriptHarness.logs(host, "warn"), ["the script used more than 1000 names with nexus.on and nexus.get; further new names are refused"])
  })
})
