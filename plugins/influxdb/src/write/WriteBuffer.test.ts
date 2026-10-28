import assert from "node:assert/strict"
import { test } from "node:test"
import { WriteBuffer } from "./WriteBuffer.ts"

const lines = (from: number, count: number) => Array.from({ length: count }, (_, i) => `l${from + i}`)

test("beyond the capacity the oldest waiting lines are dropped and counted", () => {
  const buffer = new WriteBuffer(5)
  assert.equal(buffer.add(lines(0, 3)), 0)
  assert.equal(buffer.add(lines(3, 4)), 2)
  assert.deepEqual([buffer.size, buffer.dropped], [5, 2])
  assert.deepEqual(buffer.take(10), lines(2, 5))
})

test("a held batch counts against the capacity but is never dropped", () => {
  const buffer = new WriteBuffer(5)
  buffer.add(lines(0, 4))
  assert.deepEqual(buffer.take(3), lines(0, 3))
  assert.deepEqual([buffer.waiting, buffer.size], [1, 4])
  assert.equal(buffer.add(lines(4, 3)), 2, "two of the waiting lines go, the held three stay")
  assert.deepEqual([buffer.waiting, buffer.size, buffer.dropped], [2, 5, 2])
  assert.throws(() => buffer.take(1), /still held/)
  buffer.release()
  assert.deepEqual(buffer.take(10), lines(5, 2))
})

test("the character bound drops the oldest waiting lines too", () => {
  const buffer = new WriteBuffer(100, 10)
  buffer.add(["aaaa", "bbbb"])
  assert.equal(buffer.add(["cccc"]), 1)
  assert.deepEqual([buffer.size, buffer.chars, buffer.dropped], [2, 8, 1])
  assert.deepEqual(buffer.take(1), ["bbbb"])
  assert.equal(buffer.add(["dddddd"]), 1, "the held line stays, the waiting one goes")
  assert.deepEqual([buffer.size, buffer.chars], [2, 10])
})

test("filled with long lines, the buffer stays within MAX_CHARS", () => {
  const buffer = new WriteBuffer(50_000)
  const line = "x".repeat(1000)
  for (let i = 0; i < 50; i++) buffer.add(Array.from({ length: 1000 }, () => line))
  assert.ok(buffer.chars <= WriteBuffer.MAX_CHARS, `${buffer.chars} characters`)
  assert.deepEqual([buffer.size, buffer.dropped], [WriteBuffer.MAX_CHARS / 1000, 50_000 - WriteBuffer.MAX_CHARS / 1000])
})

test("giveBack returns the end of the held batch in front of the waiting lines", () => {
  const buffer = new WriteBuffer(10, 100)
  buffer.add(lines(0, 5))
  const batch = buffer.take(4)
  buffer.giveBack(batch.slice(2))
  assert.deepEqual([buffer.size, buffer.waiting, buffer.chars], [5, 3, 10])
  buffer.release()
  assert.deepEqual(buffer.take(10), ["l2", "l3", "l4"])
})
