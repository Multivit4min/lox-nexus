import assert from "node:assert/strict"
import { test } from "node:test"
import { BoundedIndex } from "./BoundedIndex.ts"
import { CausalChain } from "./CausalChain.ts"

test("BoundedIndex keeps only the most recent keys", () => {
  const index = new BoundedIndex<number>(2)
  index.set("a", 1)
  index.set("b", 2)
  index.set("a", 3)
  index.set("c", 4)
  assert.deepEqual([index.get("a"), index.get("b"), index.get("c"), index.size], [undefined, 2, 4, 2])
})

test("CausalChain extends the wire path and resolves recent causes", () => {
  const chain = new CausalChain("boot")
  const root = chain.mint()
  const viaWire = chain.mint(root, "w1")
  const child = chain.mint(viaWire)
  assert.deepEqual([root.via, viaWire.via, child.via], [undefined, ["w1"], ["w1"]])
  assert.deepEqual(chain.resolve(child.id), { id: child.id, traceId: root.id, depth: 2, via: ["w1"] })
})
