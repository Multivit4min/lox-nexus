import assert from "node:assert/strict"
import { test } from "node:test"
import { RingBuffer } from "./RingBuffer.ts"

test("keeps the newest items, oldest first", () => {
  const buffer = new RingBuffer<number>(3)
  buffer.push([1, 2])
  buffer.push([3, 4, 5])
  assert.deepEqual(buffer.toArray(), [3, 4, 5])
  buffer.clear()
  assert.equal(buffer.size, 0)
})
