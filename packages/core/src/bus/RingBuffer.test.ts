import assert from "node:assert/strict"
import { test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { EventBus } from "./EventBus.ts"
import { Recorder } from "./Recorder.ts"
import { RingBuffer } from "./RingBuffer.ts"

test("RingBuffer overwrites the oldest item and reports what it evicted", () => {
  const ring = new RingBuffer<number>(3)
  assert.deepEqual([1, 2, 3].map(n => ring.push(n)), [undefined, undefined, undefined])
  assert.equal(ring.push(4), 1)
  assert.deepEqual(ring.toArray(), [2, 3, 4])
  assert.equal(ring.size, 3)
})

test("Recorder.recent with a zero or negative limit returns nothing", () => {
  const bus = new EventBus()
  const recorder = new Recorder(bus)
  bus.publish("a/x", Value.number(1), { source: { kind: "user", id: "u" } })
  assert.deepEqual([recorder.recent(0), recorder.recent(-5)], [[], []])
  assert.equal(recorder.recent(1).length, 1)
})
