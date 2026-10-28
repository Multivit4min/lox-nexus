import assert from "node:assert/strict"
import { afterEach, describe, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { ScriptHarness } from "../test-support/ScriptHarness.ts"

const counter = `
  const state = nexus.store.get("state") ?? { runs: 0, names: [] }
  state.runs++
  state.names.push("run " + state.runs)
  nexus.store.set("state", state)
  nexus.set("runs", state.runs)
  nexus.set("plain", Object.getPrototypeOf(state) === Object.prototype)
`

describe("nexus.store", () => {
  const harness = new ScriptHarness()
  afterEach(() => harness.cleanup())

  test("values survive a restart under the script's prefix and come back as the script's objects", async () => {
    const first = await harness.start(counter)
    assert.deepEqual(first.store, { "script:state": { runs: 1, names: ["run 1"] } })
    const second = await harness.start(counter, first.store)
    assert.deepEqual(second.store, { "script:state": { runs: 2, names: ["run 1", "run 2"] } })
    assert.deepEqual(second.values(await second.addSensor("number", { name: "runs" })), [Value.number(2)])
    assert.deepEqual(second.values(await second.addSensor("switch", { name: "plain" })), [Value.boolean(true)])
  })

  test("a read is a copy; setting undefined deletes; missing keys are undefined", async () => {
    const host = await harness.start(`
      nexus.store.set("list", [1])
      nexus.store.get("list").push(2)
      nexus.store.set("gone", 1)
      nexus.store.set("gone", undefined)
      nexus.set("result", JSON.stringify([nexus.store.get("list"), nexus.store.get("gone"), nexus.store.get("never")]))
    `)
    assert.deepEqual(host.store, { "script:list": [1] })
    assert.deepEqual(host.values(await host.addSensor("text", { name: "result" })), [Value.string("[[1],null,null]")])
  })

  test("refuses what isn't JSON and bad keys with a TypeError", async () => {
    const host = await harness.start(`
      const tries = [["m", new Map()], ["d", { when: new Date(0) }], ["f", [1, () => 2]], ["n", { x: NaN }], ["", 1], ["k".repeat(129), 1], ["big", "x".repeat(65_535)]]
      nexus.set("errors", tries.map(([key, value]) => {
        try { nexus.store.set(key, value); return "stored" } catch (error) { return (error instanceof TypeError) + " " + error.message }
      }).join("\\n"))
    `)
    const errors = await host.addSensor("text", { name: "errors" })
    assert.deepEqual((host.values(errors)[0] as { value: string }).value.split("\n"), [
      "true nexus.store.set: only JSON can be stored: value is a Map, not a plain object",
      "true nexus.store.set: only JSON can be stored: value.when is a Date, not a plain object",
      "true nexus.store.set: only JSON can be stored: value[1] is a function",
      "true nexus.store.set: only JSON can be stored: value.x is NaN, not a finite number",
      "true nexus.store.set: the key must be a string of 1 to 128 characters",
      "true nexus.store.set: the key must be a string of 1 to 128 characters",
      "true nexus.store.set: the value is 65537 characters as JSON, more than 65536"
    ])
    assert.deepEqual(host.store, {})
  })
})
