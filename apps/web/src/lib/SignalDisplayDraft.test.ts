import assert from "node:assert/strict"
import { test } from "node:test"
import { SignalDisplayDraft } from "./SignalDisplayDraft.ts"

test("a draft starts from the signal, and gives back what the input needs", () => {
  const draft = new SignalDisplayDraft({ unit: "W", decimals: 1 })
  assert.deepEqual([draft.unit, draft.decimals], ["W", "1"])
  draft.decimals = " "
  draft.unit = " kWh "
  assert.deepEqual(draft.input(), { unit: "kWh", decimals: null })
  assert.deepEqual(new SignalDisplayDraft().input(), { unit: "", decimals: null }, "empty fields say none")
  draft.decimals = "2"
  assert.deepEqual(draft.input(), { unit: "kWh", decimals: 2 })
  Object.assign(draft, { decimals: 3 })
  assert.deepEqual(draft.input(), { unit: "kWh", decimals: 3 }, "a number input's number")
  const stale = new SignalDisplayDraft({ staleAfterMin: 15 })
  assert.deepEqual(stale.staleInput(), { staleAfterMin: 15 })
  stale.staleAfterMin = ""
  assert.deepEqual(stale.staleInput(), { staleAfterMin: null }, "empty: never stale")
  assert.deepEqual([SignalDisplayDraft.applies("number"), SignalDisplayDraft.applies("any"), SignalDisplayDraft.applies("boolean")], [true, true, false])
})
