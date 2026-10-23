import assert from "node:assert/strict"
import { test } from "node:test"
import { LoadChartGeometry } from "./LoadChartGeometry.ts"

const sample = (minutesAgo: number, percent: number) => ({ ts: 3_600_000 * 10 - minutesAgo * 60_000, percent, incomingPerSecond: 0, outgoingPerSecond: 0 })
const now = 3_600_000 * 10

test("the limit is always in view; above it the axis grows in steps of 50", () => {
  assert.equal(new LoadChartGeometry([sample(1, 3)], 600, 180, now).yMax, 100)
  assert.equal(new LoadChartGeometry([sample(1, 137)], 600, 180, now).yMax, 150)
  assert.deepEqual(new LoadChartGeometry([], 600, 180, now).yTicks(), [0, 25, 50, 75, 100])
})

test("the axis spans the data: an hour at most, ten minutes at least", () => {
  const hour = new LoadChartGeometry([sample(60, 0), sample(0, 100)], 600, 180, now)
  assert.equal(hour.x(now - 3_600_000), LoadChartGeometry.MARGIN.left)
  assert.equal(hour.x(now), 600 - LoadChartGeometry.MARGIN.right)
  assert.equal(hour.y(100), LoadChartGeometry.MARGIN.top)
  assert.equal(hour.xTicks().length, 5, "every 15 minutes")
  const fresh = new LoadChartGeometry([sample(3, 5), sample(0, 5)], 600, 180, now)
  assert.equal(fresh.xStart, now - LoadChartGeometry.MIN_SPAN_MS)
  assert.equal(fresh.xTicks().length, 3, "every 5 minutes")
  assert.equal(new LoadChartGeometry([sample(25, 5), sample(0, 5)], 600, 180, now).xStart, now - 25 * 60_000)
})

test("a gap in the samples (server down) breaks the line", () => {
  const g = new LoadChartGeometry([sample(30, 5), sample(29.95, 5), sample(10, 5), sample(9.95, 5)], 600, 180, now)
  assert.equal(g.segments().length, 2)
  assert.equal(g.line().split("M").length - 1, 2)
  assert.equal(g.area().split("Z").length - 1, 2)
})

test("the crosshair snaps to the nearest sample", () => {
  const g = new LoadChartGeometry([sample(30, 10), sample(20, 20), sample(10, 30)], 600, 180, now)
  assert.equal(g.nearest(g.x(now - 19 * 60_000)), 1)
  assert.equal(new LoadChartGeometry([], 600, 180, now).nearest(100), undefined)
})
