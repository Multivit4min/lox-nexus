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

test("the last hour spans the plot, ticks on the quarter hour", () => {
  const g = new LoadChartGeometry([sample(60, 0), sample(0, 100)], 600, 180, now)
  assert.equal(g.x(now - 3_600_000), LoadChartGeometry.MARGIN.left)
  assert.equal(g.x(now), 600 - LoadChartGeometry.MARGIN.right)
  assert.equal(g.y(100), LoadChartGeometry.MARGIN.top)
  assert.equal(g.xTicks().length, 5)
})

test("the crosshair snaps to the nearest sample", () => {
  const g = new LoadChartGeometry([sample(30, 10), sample(20, 20), sample(10, 30)], 600, 180, now)
  assert.equal(g.nearest(g.x(now - 19 * 60_000)), 1)
  assert.equal(new LoadChartGeometry([], 600, 180, now).nearest(100), undefined)
})
