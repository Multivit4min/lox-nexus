import assert from "node:assert/strict"
import { test } from "node:test"
import { LoadShare } from "./LoadShare.ts"

test("a signal's share reads as a dash, a trickle or one decimal", () => {
  assert.deepEqual([undefined, 0, 0.02, 2.857, 120].map(percent => LoadShare.format(percent)), ["–", "–", "<0.1 %", "2.9 %", "120.0 %"])
})
