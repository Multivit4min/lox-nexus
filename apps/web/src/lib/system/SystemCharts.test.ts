import assert from "node:assert/strict"
import { test } from "node:test"
import type { DiagnosticsSampleDto } from "@lox-nexus/api"
import { SystemCharts } from "./SystemCharts.ts"

const sample = (ts: number, workers: Array<[string, string, number]>): DiagnosticsSampleDto => ({
  ts, rss: 1, heapUsed: 1, heapTotal: 1, external: 0, arrayBuffers: 0, cpuPercent: 1, loopDelayP50: 1, loopDelayP99: 1, loopDelayMax: 1, loopUtilization: 0.1,
  busPerSecond: 1, retainedTopics: 1, streamClients: 0, wires: 0, databaseBytes: 1, historyBytes: 1, pluginsBytes: 1, miniservers: [],
  workers: workers.map(([instanceId, label, heapUsed]) => ({ instanceId, label, heapUsed, heapTotal: heapUsed, utilization: 0 }))
})

test("a line per worker in order of appearance, with points only while it ran, under its latest name", () => {
  const charts = SystemCharts.build([sample(0, [["a", "Fronius", 5]]), sample(1, [["b", "HA", 7], ["a", "Fronius PV", 6]])])
  const workers = charts.find(chart => chart.id === "workers")!
  assert.deepEqual(workers.series.map(line => [line.name, line.points.map(point => point.v)]), [["Fronius PV", [5, 6]], ["HA", [7]]])
  assert.equal(charts.find(chart => chart.id === "cpu")?.series[1]?.points[0]?.v, 10, "utilization in percent")
})

test("more than eight lines are cut, and the chart says so", () => {
  const many = Array.from({ length: 10 }, (_, i) => [`w${i}`, `Worker ${i}`, i] as [string, string, number])
  const workers = SystemCharts.build([sample(0, many)]).find(chart => chart.id === "workers")!
  assert.equal(workers.series.length, 8)
  assert.equal(workers.note, "2 more in the CSV download")
})

test("values read in the unit of their chart", () => {
  assert.deepEqual([SystemCharts.format("bytes", 64 * 1024 * 1024), SystemCharts.format("bytes", 3 * 1024 ** 3), SystemCharts.format("ms", 1.234), SystemCharts.format("perSecond", 12.4)],
    ["64.0 MiB", "3.00 GiB", "1.23 ms", "12/s"])
})
