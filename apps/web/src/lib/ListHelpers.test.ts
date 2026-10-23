import assert from "node:assert/strict"
import { test } from "node:test"
import { Selection } from "./Selection.ts"
import { TextFilter } from "./TextFilter.ts"

test("every word must match some field, case-insensitively", () => {
  const filter = new TextFilter("  KÜCHE  dimmer ")
  assert.equal(filter.matches("Küche Licht", "dimmer1"), true)
  assert.equal(filter.matches("Küche Licht", "rgbw"), false)
  assert.equal(new TextFilter("").matches(undefined), true)
})

test("select all covers only the visible rows and clears when all are selected", () => {
  const selection = new Selection()
  selection.toggle("hidden", true)
  assert.equal(selection.stateOf(["a", "b"]), false)
  selection.toggleAll(["a", "b"])
  assert.equal(selection.stateOf(["a", "b"]), true)
  assert.deepEqual(selection.pick(["b", "a"]), ["b", "a"], "bulk actions only see visible rows")
  selection.toggle("a", false)
  assert.equal(selection.stateOf(["a", "b"]), "indeterminate")
  selection.toggleAll(["a", "b"])
  selection.toggleAll(["a", "b"])
  assert.equal(selection.stateOf(["a", "b"]), false)
  selection.retain(["a"])
  assert.equal(selection.has("hidden"), false, "rows that disappeared are forgotten")
})
