import assert from "node:assert/strict"
import { test } from "node:test"
import type { HistorySeriesDto } from "@lox-nexus/api"
import { SeriesChartGeometry } from "./SeriesChartGeometry.ts"
import { TimeAxis } from "./TimeAxis.ts"

const MIN = 60_000
const raw = (points: Array<[number, number | null]>, extra: Partial<HistorySeriesDto> = {}): HistorySeriesDto =>
  ({ signalId: "s", valueType: "number", from: 0, to: 60 * MIN, gaps: [], resolution: "raw", points: points.map(([ts, v]) => ({ ts, v })), ...extra }) as HistorySeriesDto

test("raw values hold until they change; the value before the range starts the line", () => {
  const geometry = new SeriesChartGeometry(raw([[10 * MIN, 20], [30 * MIN, 25]], { before: { ts: -MIN, v: 18 } }), 600, 200, Infinity)
  assert.deepEqual(geometry.steps, [{ from: 0, to: 10 * MIN, v: 18 }, { from: 10 * MIN, to: 30 * MIN, v: 20 }, { from: 30 * MIN, to: 60 * MIN, v: 25 }])
  assert.equal(geometry.line().split("M").length - 1, 1, "one connected staircase")
  assert.deepEqual([geometry.yMin, geometry.yMax], [18, 26])
})

test("gaps and 'no value' break the line; after a gap it waits for the next change", () => {
  const series = raw([[0, 1], [20 * MIN, null], [30 * MIN, 2]], { gaps: [{ from: 40 * MIN, to: 50 * MIN }] })
  const geometry = new SeriesChartGeometry(series, 600, 200, 55 * MIN)
  assert.deepEqual(geometry.steps, [{ from: 0, to: 20 * MIN, v: 1 }, { from: 30 * MIN, to: 40 * MIN, v: 2 }], "nothing after the gap nor after now")
  assert.equal(geometry.line().split("M").length - 1, 2)
})

test("buckets draw their average, carry the last value between them, and a min/max band", () => {
  const bucket = (ts: number, min: number, max: number, avg: number, last: number) => ({ ts, min, max, avg, last, n: 2 })
  const series = { signalId: "s", valueType: "number", from: 0, to: 30 * MIN, gaps: [], resolution: "5m", width: 5 * MIN, points: [bucket(0, 1, 5, 3, 5), bucket(15 * MIN, 0, 4, 2, 4)] } as HistorySeriesDto
  const geometry = new SeriesChartGeometry(series, 600, 200, Infinity)
  assert.deepEqual(geometry.steps.map(s => [s.from / MIN, s.to / MIN, s.v]), [[0, 5, 3], [5, 15, 5], [15, 20, 2], [20, 30, 4]])
  assert.equal(geometry.band().split("M").length - 1, 2)
})

test("on/off is 0 to 1; other values get round ticks", () => {
  assert.deepEqual(new SeriesChartGeometry(raw([[0, 1]], { valueType: "boolean" }), 600, 200, Infinity).yTicks(), [0, 1])
  const ticks = new SeriesChartGeometry(raw([[0, 3], [MIN, 47]]), 600, 200, Infinity).yTicks()
  assert.deepEqual(ticks, [0, 20, 40, 60])
})

test("the time axis picks round steps from minutes to years", () => {
  const hour = new TimeAxis(0, 60 * MIN, 0, 600)
  assert.equal(hour.step(), 15 * MIN)
  assert.equal(hour.x(30 * MIN), 300)
  assert.equal(new TimeAxis(0, 7 * 24 * 60 * MIN, 0, 600).step(), 2 * 24 * 60 * MIN)
  assert.equal(new TimeAxis(0, 365 * 24 * 60 * MIN, 0, 600).step(), 91 * 24 * 60 * MIN)
  const ticks = new TimeAxis(Date.UTC(2026, 9, 28, 10, 7), Date.UTC(2026, 9, 28, 11, 7), 0, 600).ticks()
  assert.ok(ticks.length >= 4 && ticks.every(ts => new Date(ts).getMinutes() % 15 === 0))
})

test("a constant huge value gets a range and two ticks instead of hanging", () => {
  const geometry = new SeriesChartGeometry(raw([[0, 1e17]]), 600, 200, Infinity)
  assert.ok(geometry.yMax > geometry.yMin)
  assert.ok(geometry.yTicks().length <= 51)
  assert.ok(Number.isFinite(geometry.y(1e17)))
})

test("the bucket open when Nexus came back is drawn after the gap", () => {
  const series = {
    signalId: "s", valueType: "number", from: 0, to: 180 * MIN, gaps: [{ from: 0, to: 63 * MIN }], resolution: "1h", width: 60 * MIN,
    points: [{ ts: 60 * MIN, min: 5, max: 9, avg: 7, last: 9, n: 3 }]
  } as HistorySeriesDto
  const geometry = new SeriesChartGeometry(series, 600, 200, Infinity)
  assert.deepEqual(geometry.steps.map(s => [s.from / MIN, s.to / MIN, s.v]), [[63, 120, 7], [120, 180, 9]])
})

test("month steps fall on the first of a month", () => {
  const ticks = new TimeAxis(new Date(2026, 0, 15).getTime(), new Date(2026, 11, 31).getTime(), 0, 600).ticks()
  assert.ok(ticks.length >= 3 && ticks.every(ts => new Date(ts).getDate() === 1 && new Date(ts).getHours() === 0))
})

