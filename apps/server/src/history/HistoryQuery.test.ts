import assert from "node:assert/strict"
import { test } from "node:test"
import { HistorySettingsSchema } from "@lox-nexus/api"
import { HistoryDatabase } from "../db/history/HistoryDatabase.ts"
import { HistoryReadRepository } from "../db/history/HistoryReadRepository.ts"
import { HistoryRepository } from "../db/history/HistoryRepository.ts"
import { HistoryQuery } from "./HistoryQuery.ts"

const HOUR = 3_600_000
const DAY = 24 * HOUR
const now = 200 * DAY

function setup(settings = {}) {
  const database = new HistoryDatabase(":memory:")
  const store = new HistoryRepository(database.db)
  const query = new HistoryQuery(new HistoryReadRepository(database.db), () => HistorySettingsSchema.parse(settings), { now: () => now })
  return { database, store, query }
}

test("gaps are the times no run of Nexus covers after history began, ignoring the lag of a run's last write", () => {
  const { database, store, query } = setup()
  const sample = { signalId: "a", valueType: "number", ts: now - 3 * HOUR, num: 1, text: null, flags: 0 }
  store.write({ samples: [sample], buckets: [], run: { started: now - 4 * HOUR, seen: now - 3 * HOUR } })
  store.write({ samples: [], buckets: [], run: { started: now - 2 * HOUR, seen: now - 60_000 } })
  const result = query.run("a", "number", { from: now - 5 * HOUR, to: now, points: 800 })
  assert.deepEqual(result.gaps, [{ from: now - 3 * HOUR + HistoryQuery.SLACK_MS, to: now - 2 * HOUR }], "before the first run is no downtime")
  const later = query.run("a", "number", { from: now - 150 * 60_000, to: now, points: 800 })
  assert.deepEqual(later.gaps, [{ from: now - 150 * 60_000, to: now - 2 * HOUR }], "a range starting while Nexus was down after an earlier run")
  assert.deepEqual([result.resolution, result.points.length], ["raw", 1])
  database.close()
})

test("ranges beyond the kept raw and 5-minute tiers read 1-hour buckets; text stays raw", () => {
  const { database, store, query } = setup({ rawDays: 7, fineDays: 30 })
  const bucket = (width: number, start: number) => ({ signalId: "a", valueType: "number", width, start, min: 1, max: 3, wsum: 2 * width, wdur: width, n: 2, last: 3, flags: 1 })
  store.write({ samples: [], buckets: [bucket(HOUR, now - 60 * DAY), bucket(300_000, now - 10 * DAY)], run: { started: 0, seen: now } })
  const old = query.run("a", "number", { from: now - 90 * DAY, to: now - 50 * DAY, points: 800 })
  assert.equal(old.resolution, "1h")
  assert.deepEqual(old.points, [{ ts: now - 60 * DAY, min: 1, max: 3, avg: 2, last: 3, n: 2, forced: true }])
  assert.equal(query.run("a", "number", { from: now - 10 * DAY, to: now - 9 * DAY, points: 800 }).resolution, "5m", "a day is 288 buckets, within 800 points")
  assert.equal(query.run("a", "number", { from: now - 20 * DAY, to: now - 9 * DAY, points: 800 }).resolution, "1h", "eleven days of 5 minutes are too many points")
  store.write({ samples: [{ signalId: "t", valueType: "string", ts: now - 60 * DAY, num: null, text: "hi", flags: 0 }], buckets: [], run: { started: 0, seen: now } })
  assert.equal(query.run("t", "string", { from: now - 90 * DAY, to: now, points: 800 }).resolution, "raw")
  database.close()
})

test("the value before a range comes from the buckets once the raw tier no longer has it", () => {
  const { database, store, query } = setup()
  store.write({ samples: [], buckets: [{ signalId: "a", valueType: "number", width: 300_000, start: now - 30 * DAY, min: 4, max: 4, wsum: 0, wdur: 0, n: 1, last: 4, flags: 0 }], run: { started: 0, seen: now } })
  const result = query.run("a", "number", { from: now - HOUR, to: now, points: 800 })
  assert.deepEqual([result.resolution, result.before?.v], ["raw", 4], "a setpoint unchanged for a month still shows")
  database.close()
})

test("years of hourly buckets are merged down to about the requested points", () => {
  const { database, store, query } = setup({ rawDays: 1, coarseDays: 0 })
  const buckets = Array.from({ length: 48 }, (_, i) => ({ signalId: "a", valueType: "number", width: HOUR, start: now - 48 * HOUR + i * HOUR, min: i, max: i, wsum: i * HOUR, wdur: HOUR, n: 1, last: i, flags: 0 }))
  store.write({ samples: [], buckets, run: { started: 0, seen: now } })
  const result = query.run("a", "number", { from: now - 48 * HOUR, to: now, points: 12 })
  if (result.resolution !== "1h") return assert.fail(`expected hourly buckets, got ${result.resolution}`)
  assert.equal(result.width, 4 * HOUR)
  assert.equal(result.points.length, 12)
  assert.deepEqual([result.points[0]!.min, result.points[0]!.max, result.points[0]!.avg, result.points[0]!.n], [0, 3, 1.5, 4])
  database.close()
})

