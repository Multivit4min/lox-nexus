import assert from "node:assert/strict"
import { test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { PayloadGuess } from "./PayloadGuess.ts"
import { TopicCache } from "./TopicCache.ts"

const guess = (payload: string, clipped = false) => PayloadGuess.of({ topic: "t", payload, clipped, retained: true })

test("plain payloads: numbers, on/off words, else text (clipped for the preview)", () => {
  assert.deepEqual(guess("21,5"), { kind: "plain", entry: { kind: "sensor", capability: "number", label: "t", params: { topic: "t" }, value: Value.number(21.5) } })
  const off = guess("Off")
  assert.equal(off.kind === "plain" ? off.entry.capability : "", "switch")
  const long = guess("x".repeat(300))
  assert.deepEqual(long.kind === "plain" ? long.entry.value : undefined, Value.string(`${"x".repeat(200)}…`))
  const array = guess("[1,2]")
  assert.equal(array.kind, "plain", "arrays are text")
  const clipped = guess("{\"a\":1", true)
  assert.equal(clipped.kind, "plain", "a clipped JSON object can't be parsed")
})

test("JSON objects: the whole document plus up to MAX_FIELDS fields", () => {
  const fields = Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`f${index}`, index]))
  const many = guess(JSON.stringify(fields))
  assert.equal(many.kind === "json" ? many.entries.length : 0, PayloadGuess.MAX_FIELDS + 1)
  const deep = guess(JSON.stringify({ a: { b: { c: { d: 1 } }, x: 2 } }))
  assert.deepEqual(deep.kind === "json" ? deep.entries.map(entry => (entry.params as { path: string }).path) : [], ["", "a.x"], "three levels deep at most")
})

test("the cache keeps at most `limit` topics, the oldest heard of goes first; an empty payload removes a topic", () => {
  const cache = new TopicCache(2)
  cache.record("a", Buffer.from("1"), false)
  cache.record("b", Buffer.from("2"), false)
  cache.record("a", Buffer.from("3"), false)
  cache.record("c", Buffer.from("4"), false)
  assert.deepEqual(cache.list().map(topic => [topic.topic, topic.payload]), [["a", "3"], ["c", "4"]])
  assert.equal(cache.evicted, 1)
  cache.record("a", Buffer.alloc(0), true)
  assert.deepEqual(cache.list().map(topic => topic.topic), ["c"])
  cache.record("big", Buffer.from("é".repeat(5000)), false)
  const big = cache.list().find(topic => topic.topic === "big")
  assert.deepEqual([big?.payload.length, big?.clipped], [TopicCache.MAX_PAYLOAD, true])
})
