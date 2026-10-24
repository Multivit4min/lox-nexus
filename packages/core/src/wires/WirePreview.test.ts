import assert from "node:assert/strict"
import { test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { WirePreview } from "./WirePreview.ts"

test("a preview shows every step and converts to the target's type", () => {
  const result = new WirePreview().run(Value.number(50), [{ op: "scale", from: [0, 100], to: [0, 1] }, { op: "invert" }], "number")
  assert.deepEqual(result.steps, [{ op: "scale", value: Value.number(0.5) }, { op: "invert", value: Value.boolean(false) }])
  assert.deepEqual(result.delivered, Value.number(0))
})

test("timed steps pass the value through with a note, and nothing is left running", () => {
  const result = new WirePreview().run(Value.string("on"), [{ op: "debounce", ms: 500 }, { op: "throttle", ms: 1000 }], "any")
  assert.deepEqual(result.steps.map(step => step.value), [Value.string("on"), Value.string("on")])
  assert.match(result.steps[0]?.note ?? "", /500 ms/)
  assert.match(result.steps[1]?.note ?? "", /1000 ms/)
  assert.deepEqual(result.delivered, Value.string("on"))
})

test("without transforms the value is only converted", () => {
  assert.deepEqual(new WirePreview().run(Value.boolean(true), [], "number"), { steps: [], delivered: Value.number(1) })
})
