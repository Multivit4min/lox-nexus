import assert from "node:assert/strict"
import { test } from "node:test"
import { BucketAccumulator } from "./BucketAccumulator.ts"
import type { BucketPart } from "./HistoryTypes.ts"

const MIN = 60_000
const avg = (part: BucketPart) => part.wsum / part.wdur

test("time-weighted: a value that held longer counts more", () => {
  const acc = new BucketAccumulator(5 * MIN)
  acc.set(0, 10, 0)
  acc.set(4 * MIN, 20, 0)
  const [bucket, ...rest] = acc.drain(5 * MIN)
  assert.deepEqual(rest, [])
  assert.deepEqual([bucket!.start, bucket!.min, bucket!.max, bucket!.n, bucket!.last, bucket!.wdur], [0, 10, 20, 2, 20, 5 * MIN])
  assert.equal(avg(bucket!), 12, "4 min at 10, 1 min at 20")
})

test("on/off averages to the share of time it was on", () => {
  const acc = new BucketAccumulator(10 * MIN)
  acc.set(0, 0, 0)
  acc.set(3 * MIN, 1, 0)
  acc.set(6 * MIN, 0, 0)
  assert.ok(Math.abs(avg(acc.drain(10 * MIN)[0]!) - 0.3) < 1e-12)
})

test("only buckets with a change are handed out; the next starts with the carried value", () => {
  const acc = new BucketAccumulator(5 * MIN)
  acc.set(MIN, 7, 0)
  // nothing changes for 20 minutes, then one change
  const ended = acc.set(21 * MIN, 9, 0)
  assert.deepEqual(ended.map(b => [b.start, b.min, b.max, b.wdur]), [[0, 7, 7, 4 * MIN]], "the buckets in between are not written")
  const [current] = acc.drain(25 * MIN)
  assert.deepEqual([current!.start, current!.min, current!.max, current!.n], [20 * MIN, 7, 9, 1], "7 was carried in, 9 set")
  assert.equal(avg(current!), (7 * MIN + 9 * 4 * MIN) / (5 * MIN))
})

test("parts of one bucket add up to the whole, like the store merges them", () => {
  const acc = new BucketAccumulator(5 * MIN)
  acc.set(0, 4, 0)
  const first = acc.drain(2 * MIN)
  acc.set(3 * MIN, 8, 1)
  const second = acc.drain(5 * MIN)
  const parts = [...first, ...second]
  assert.deepEqual(parts.map(p => p.start), [0, 0])
  const merged = {
    min: Math.min(...parts.map(p => p.min!)), max: Math.max(...parts.map(p => p.max!)), n: parts.reduce((s, p) => s + p.n, 0),
    wsum: parts.reduce((s, p) => s + p.wsum, 0), wdur: parts.reduce((s, p) => s + p.wdur, 0), flags: parts.reduce((s, p) => s | p.flags, 0)
  }
  assert.deepEqual(merged, { min: 4, max: 8, n: 2, wsum: 4 * 3 * MIN + 8 * 2 * MIN, wdur: 5 * MIN, flags: 1 })
  assert.deepEqual(acc.drain(6 * MIN).map(p => p.start), [], "the ended bucket was fully written; the new one has no change yet")
})

test("no value (null) stops the line; a clock going back is held", () => {
  const acc = new BucketAccumulator(10 * MIN)
  acc.set(0, 5, 0)
  acc.set(2 * MIN, null, 0)
  acc.set(MIN, 6, 0)
  const [bucket] = acc.drain(10 * MIN)
  assert.deepEqual([bucket!.wdur, bucket!.last, bucket!.n], [2 * MIN + 8 * MIN, 6, 3], "null counted no time; 6 holds from 2 min, where the clock was")
  assert.equal(avg(bucket!), (5 * 2 * MIN + 6 * 8 * MIN) / (10 * MIN))
})
