import assert from "node:assert/strict"
import { test } from "node:test"
import { DurationDraft } from "./DurationDraft.ts"

test("a loaded value shows in the largest unit that holds it evenly", () => {
  const draft = new DurationDraft("5400", "s")
  assert.deepEqual([draft.text, draft.unit], ["90", "min"])
  draft.receive("7200")
  assert.deepEqual([draft.text, draft.unit], ["2", "h"])
})

test("typing a fraction keeps the unit and the text as typed", () => {
  const draft = new DurationDraft("3600", "s")
  for (const text of ["1", "1.", "1.5"]) {
    const value = draft.type(text)
    draft.receive(value)
    assert.deepEqual([draft.text, draft.unit], [text, "h"])
  }
  assert.equal(draft.type("1.5"), "5400")
})

test("another unit converts the amount, not the value; text that isn't a number is kept for the form to refuse", () => {
  const draft = new DurationDraft("120", "s")
  draft.pick("s")
  assert.deepEqual([draft.text, draft.unit], ["120", "s"])
  assert.equal(draft.type("abc"), "abc")
  draft.pick("min")
  assert.equal(draft.text, "abc")
})
