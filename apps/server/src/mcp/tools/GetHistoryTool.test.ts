import assert from "node:assert/strict"
import { test } from "node:test"
import type { HistorySeriesDto } from "@lox-nexus/api"
import { HttpError } from "../../http/HttpError.ts"
import { GetHistoryTool } from "./GetHistoryTool.ts"

const now = Date.UTC(2026, 9, 31, 12)
const inventory = {
  require: (ref: string) => {
    if (ref !== "loxone/haus/in/temp") throw HttpError.notFound(`signal "${ref}"`)
    return { id: "s1", topic: ref }
  }
} as never

test("raw changes as rows with times, rounded to the signal's decimals; the range defaults to the last 24 h", () => {
  const asked: unknown[] = []
  const series: HistorySeriesDto = {
    signalId: "s1", valueType: "number", unit: "°C", decimals: 1, from: now - 86_400_000, to: now, gaps: [{ from: now - 7_200_000, to: now - 3_600_000 }],
    resolution: "raw", points: [{ ts: now - 60_000, v: 21.04 }, { ts: now - 30_000, v: 21.56, forced: true }]
  }
  const tool = new GetHistoryTool(inventory, { series: (_id, input) => (asked.push(input), series) }, () => now)
  const answer = tool.run({ signal: "loxone/haus/in/temp", hours: 24, points: 100 }) as Record<string, unknown>
  assert.deepEqual(asked, [{ from: now - 86_400_000, to: now, points: 100 }])
  assert.deepEqual(answer.columns, ["time", "value", "forced"])
  assert.deepEqual(answer.rows, [["2026-10-31T11:59:00.000Z", 21, null], ["2026-10-31T11:59:30.000Z", 21.6, true]])
  assert.equal(answer.unit, "°C")
  assert.deepEqual(answer.gaps, ["2026-10-31T10:00:00.000Z – 2026-10-31T11:00:00.000Z"])
})

test("buckets for long ranges; an unknown signal is a 404", () => {
  const series: HistorySeriesDto = {
    signalId: "s1", valueType: "number", from: 0, to: now, gaps: [], resolution: "1h", width: 3_600_000,
    points: [{ ts: now - 3_600_000, min: 1, max: 3, avg: 2, last: 3, n: 4 }]
  }
  const tool = new GetHistoryTool(inventory, { series: () => series }, () => now)
  const answer = tool.run({ signal: "loxone/haus/in/temp", from: "2026-10-01T00:00:00Z", hours: 24, points: 100 }) as Record<string, unknown>
  assert.deepEqual(answer.columns, ["from", "min", "max", "avg", "last", "changes"])
  assert.deepEqual(answer.rows, [["2026-10-31T11:00:00.000Z", 1, 3, 2, 3, 4]])
  assert.throws(() => tool.run({ signal: "nope", hours: 24, points: 100 }), /not found/)
})
