import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { EventData } from "./EventData.ts"

describe("EventData", () => {
  const data = new EventData({ device_ieee: "00:11", endpoint_id: 1, command: "step", args: [0, 43, 5], params: { step_mode: 0, nested: { on: true } }, empty: null })

  test("reads fields by dot path, also into lists", () => {
    assert.equal(data.at("command"), "step")
    assert.equal(data.at("args.1"), 43)
    assert.equal(data.at("params.nested.on"), true)
    assert.equal(data.at("params.missing.on"), undefined)
    assert.equal(data.at("command.length"), undefined, "no properties of strings")
  })

  test("matches when every filter entry does; numbers and text compare as text", () => {
    assert.ok(data.matches({}))
    assert.ok(data.matches({ device_ieee: "00:11", endpoint_id: "1", "params.step_mode": 0 }))
    assert.ok(data.matches({ args: [0, 43, 5], empty: null }), "lists compare as JSON")
    assert.ok(!data.matches({ device_ieee: "00:11", command: "on" }))
    assert.ok(!data.matches({ missing: "" }), "a missing field matches nothing")
  })

  test("gives a field as text; nothing for a missing or null field", () => {
    assert.deepEqual(["command", "endpoint_id", "params.nested.on", "args", "empty", "nope"].map(path => data.text(path)), [
      "step", "1", "true", "[0,43,5]", undefined, undefined
    ])
  })

  test("cuts long texts, e.g. a whole entity state as JSON", () => {
    const text = new EventData({ new_state: { attributes: { entries: "x".repeat(5000) } } }).text("new_state")
    assert.equal(text?.length, 1000)
    assert.ok(text?.endsWith("…"))
  })
})
