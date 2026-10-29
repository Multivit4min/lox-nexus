import assert from "node:assert/strict"
import { test } from "node:test"
import { HeapTrend } from "./HeapTrend.ts"

const MIB = 1024 * 1024
const MINUTE = 60_000
/** samples every 30 s for `hours`, a sawtooth (garbage collection) on top of a floor that grows by `perHour` MiB */
const run = (hours: number, floorMib: number, perHour: number) =>
  Array.from({ length: hours * 120 }, (_, i) => ({ ts: i * 30_000, v: (floorMib + (perHour * i) / 120 + (i % 10) * 0.8) * MIB }))

test("a heap that saws but keeps its floor is flat", () => {
  const trend = HeapTrend.of(run(24, 60, 0), 30_000)
  assert.equal(trend?.verdict, "flat")
  assert.ok(Math.abs(trend!.mibPerHour) < 0.1, String(trend?.mibPerHour))
  assert.ok(trend!.hours > 23)
})

test("a floor that rises 1 MiB an hour is a leak; a falling one shrinks", () => {
  const growing = HeapTrend.of(run(12, 60, 1), 30_000)
  assert.equal(growing?.verdict, "growing")
  assert.ok(Math.abs(growing!.mibPerHour - 1) < 0.05, String(growing?.mibPerHour))
  assert.equal(HeapTrend.of(run(12, 200, -2), 30_000)?.verdict, "shrinking")
})

test("the warm-up is left out, and there is no verdict before an hour of windows", () => {
  // a jump during the first 10 minutes doesn't count as growth
  const points = run(3, 60, 0).map(point => (point.ts < 10 * MINUTE ? { ...point, v: point.v / 2 } : point))
  assert.equal(HeapTrend.of(points, 30_000)?.verdict, "flat")
  assert.equal(HeapTrend.of(run(1, 60, 0), 30_000), undefined)
})

test("a window that is still running or has a gap is left out, so a flat heap stays flat at any minute", () => {
  // a 16 MiB sawtooth over 8 samples, shifted, on a flat floor
  const sawtooth = (minutes: number) => Array.from({ length: minutes * 2 }, (_, i) => ({ ts: i * 30_000, v: (60 + ((i + 3) % 8) * 2) * MIB }))
  for (const minutes of [71, 73, 81, 82, 121, 122, 150]) {
    assert.equal(HeapTrend.of(sawtooth(minutes), 30_000)?.verdict, "flat", `${minutes} min`)
  }
})

test("after a gap (a worker that restarted) the warm-up applies again", () => {
  const before = run(3, 60, 0)
  // restarted 30 minutes later with an empty heap that fills over 10 minutes, then stays
  const restart = 3 * 3_600_000 + 30 * MINUTE
  const after = Array.from({ length: 4 * 120 }, (_, i) => ({ ts: restart + i * 30_000, v: (i < 20 ? 10 + i * 2.5 : 60) * MIB }))
  assert.equal(HeapTrend.of([...before, ...after], 30_000)?.verdict, "flat")
})

