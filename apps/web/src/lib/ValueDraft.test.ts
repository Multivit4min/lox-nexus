import assert from "node:assert/strict"
import { test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { ValueDraft } from "./ValueDraft.ts"

test("round-trips values through the form representation", () => {
  const values = [Value.number(21.5), Value.boolean(true), Value.string("hi"), Value.rgbw({ red: 100, green: 0, blue: 0, white: 0, fadeTime: 1, flags: 0 }), Value.null()]
  for (const value of values) {
    const draft = ValueDraft.from(value)
    assert.deepEqual(ValueDraft.parse(draft.type, draft.text), { value })
  }
})

test("explains what is wrong", () => {
  assert.deepEqual(ValueDraft.parse("number", "abc"), { error: "not a number" })
  assert.deepEqual(ValueDraft.parse("rgbw", "{"), { error: "not valid JSON" })
  const outOfRange = ValueDraft.parse("rgbw", JSON.stringify({ red: 300, green: 0, blue: 0, white: 0, fadeTime: 0, flags: 0 }))
  assert.match("error" in outOfRange ? outOfRange.error : "", /red/)
})
