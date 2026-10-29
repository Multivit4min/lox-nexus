import assert from "node:assert/strict"
import { test } from "node:test"
import { BoundedIndex } from "./BoundedIndex.ts"

test("BoundedIndex keeps only the most recent keys", () => {
  const index = new BoundedIndex<number>(2)
  index.set("a", 1)
  index.set("b", 2)
  index.set("a", 3)
  index.set("c", 4)
  assert.deepEqual([index.get("a"), index.get("b"), index.get("c"), index.size], [undefined, 2, 4, 2])
})
