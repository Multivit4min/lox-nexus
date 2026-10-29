import assert from "node:assert/strict"
import { test } from "node:test"
import { CausalChain } from "./CausalChain.ts"

test("CausalChain carries trace, depth and the wire path to the messages a cause causes", () => {
  const chain = new CausalChain("boot")
  const root = chain.mint()
  const viaWire = chain.mint(root, "w1")
  const child = chain.mint(viaWire)
  assert.deepEqual(root, { id: "boot-1", seq: 1, traceId: "boot-1", depth: 0 })
  assert.deepEqual(viaWire, { id: "boot-2", seq: 2, traceId: "boot-1", causedBy: "boot-1", depth: 1, via: ["w1"] })
  assert.deepEqual(child, { id: "boot-3", seq: 3, traceId: "boot-1", causedBy: "boot-2", depth: 2, via: ["w1"] })
})
