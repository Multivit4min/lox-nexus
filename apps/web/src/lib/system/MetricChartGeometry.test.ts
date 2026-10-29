import assert from "node:assert/strict"
import { test } from "node:test"
import { MetricChartGeometry } from "./MetricChartGeometry.ts"

const line = (name: string, values: Array<[number, number]>) => ({ name, points: values.map(([ts, v]) => ({ ts, v })) })

test("the y axis starts at 0 and ends on a round value above the peak", () => {
  assert.deepEqual([MetricChartGeometry.nice(0), MetricChartGeometry.nice(7), MetricChartGeometry.nice(21), MetricChartGeometry.nice(380)], [1, 10, 25, 500])
  const geometry = new MetricChartGeometry([line("a", [[0, 10], [1000, 40]])], 0, 1000, 400, 200, 100)
  assert.equal(geometry.yMax, 50)
  assert.deepEqual(geometry.yTicks(), [0, 12.5, 25, 37.5, 50])
  assert.equal(geometry.y(0), 200 - MetricChartGeometry.MARGIN.bottom)
})

test("a line breaks where samples are further apart than the gap, and leaves out what is outside the range", () => {
  const geometry = new MetricChartGeometry([line("a", [[-50, 1], [0, 1], [30, 2], [200, 3], [230, 4]])], 0, 300, 400, 200, 60)
  const path = geometry.path(geometry.series[0]!)
  assert.equal(path.match(/M/g)?.length, 2)
  // each segment starts with a zero-length line (a dot on its own), then one line per further point
  assert.equal(path.match(/L/g)?.length, 4)
})

test("a lone point still draws, and a peak line keeps the spike that averaging would flatten", () => {
  const lone = new MetricChartGeometry([line("a", [[500, 3]])], 0, 1000, 400, 200, 100)
  assert.match(lone.path(lone.series[0]!), /^M([\d.]+,[\d.]+)L\1$/)
  const values: Array<[number, number]> = Array.from({ length: 1000 }, (_, i) => [i * 10, i === 500 ? 500 : 1])
  const spiky = new MetricChartGeometry([{ ...line("max", values), peak: true }, line("avg", values)], 0, 10_000, 260, 200, 100)
  const top = (path: string) => Math.min(...path.split(/[ML]/).filter(Boolean).map(point => Number(point.split(",")[1])))
  assert.ok(Math.abs(top(spiky.path(spiky.series[0]!)) - spiky.y(500)) < 0.5, "the peak line reaches 500")
  assert.ok(top(spiky.path(spiky.series[1]!)) > spiky.y(100), "the average stays low")
})

test("many samples per two pixels are drawn as their average, and a gap still breaks the line", () => {
  const points: Array<[number, number]> = Array.from({ length: 1000 }, (_, i) => [i * 10, i % 2 ? 10 : 0])
  const later: Array<[number, number]> = Array.from({ length: 1000 }, (_, i) => [20_000 + i * 10, 5])
  const geometry = new MetricChartGeometry([line("a", [...points, ...later])], 0, 30_000, 260, 200, 100)
  const path = geometry.path(geometry.series[0]!)
  assert.equal(path.match(/M/g)?.length, 2, "the gap between 10 000 and 20 000")
  assert.ok((path.match(/[ML]/g)?.length ?? 0) < 200, "about one point per two pixels")
  assert.ok(path.split(/[ML]/).filter(Boolean).slice(0, 5).every(point => Math.abs(Number(point.split(",")[1]) - geometry.y(5)) < 0.5), "the sawtooth averages to its middle")
})

test("the pointer snaps to the nearest sample of any line", () => {
  const geometry = new MetricChartGeometry([line("a", [[0, 1], [100, 1]]), line("b", [[60, 2]])], 0, 100, 400, 200, 1000)
  assert.equal(geometry.nearest(geometry.axis.x(55)), 60)
  assert.equal(geometry.nearest(geometry.axis.x(95)), 100)
})
