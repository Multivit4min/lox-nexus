import assert from "node:assert/strict"
import { test } from "node:test"
import { SignalDisplayDraft } from "./SignalDisplayDraft.ts"

test("a draft starts from the signal, and gives back what the input needs", () => {
  const draft = new SignalDisplayDraft({ unit: "W", decimals: 1 })
  assert.deepEqual([draft.unit, draft.decimals], ["W", "1"])
  draft.decimals = " "
  draft.unit = " kWh "
  assert.deepEqual(draft.input(), { unit: "kWh" })
  assert.deepEqual(new SignalDisplayDraft().input(), { unit: "" }, "an empty unit clears it")
  draft.decimals = "2"
  assert.deepEqual(draft.input(), { unit: "kWh", decimals: 2 })
  Object.assign(draft, { decimals: 3 })
  assert.deepEqual(draft.input(), { unit: "kWh", decimals: 3 }, "a number input's number")
  assert.deepEqual([SignalDisplayDraft.applies("number"), SignalDisplayDraft.applies("any"), SignalDisplayDraft.applies("boolean")], [true, true, false])
})
