import assert from "node:assert/strict"
import { test } from "node:test"
import type { DiagnosticsSampleDto } from "@lox-nexus/api"
import { DiagnosticsCsv } from "./DiagnosticsCsv.ts"

const sample = (ts: number, workers: DiagnosticsSampleDto["workers"]): DiagnosticsSampleDto => ({
  ts, rss: 1, heapUsed: 2, heapTotal: 3, external: 0, arrayBuffers: 0, cpuPercent: 1.5, loopDelayP50: 0, loopDelayP99: 0, loopDelayMax: 0, loopUtilization: 0.01,
  busPerSecond: 2, retainedTopics: 60, streamClients: 1, wires: 3, databaseBytes: 100, historyBytes: 200, pluginsBytes: 300, workers,
  miniservers: [{ id: "m1", label: "=Haus", incomingPerSecond: 1.5, outgoingPerSecond: 0.5 }]
})

test("a column per figure, worker and Miniserver; names are quoted where needed and can't become formulas", () => {
  const fronius = { instanceId: "p1", label: "Fronius, \"PV\"", heapUsed: 5e6, heapTotal: 8e6, utilization: 0.01 }
  const csv = new DiagnosticsCsv().write([sample(Date.parse("2026-10-29T10:00:00Z"), [fronius]), sample(Date.parse("2026-10-29T10:00:30Z"), [])])
  const [header, first, second] = csv.split("\r\n")
  assert.match(header ?? "", /^time,rss,heapUsed,/)
  assert.match(header ?? "", /,"Fronius, ""PV"" heapUsed","Fronius, ""PV"" heapTotal","Fronius, ""PV"" utilization",'=Haus in\/s,'=Haus out\/s$/)
  assert.match(first ?? "", /^2026-10-29T10:00:00\.000Z,1,2,3,/)
  assert.match(first ?? "", /,5000000,8000000,0\.01,1\.5,0\.5$/)
  assert.match(second ?? "", /,,,,1\.5,0\.5$/, "empty where the worker didn't run")
})
