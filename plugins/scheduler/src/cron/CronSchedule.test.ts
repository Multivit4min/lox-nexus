import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { Zone } from "../time/Zone.ts"
import { CronExpression } from "./CronExpression.ts"
import { CronSchedule } from "./CronSchedule.ts"

const vienna = new Zone("Europe/Vienna")
const schedule = (text: string, zone = vienna) => new CronSchedule(CronExpression.parse(text), zone)
const at = (iso: string) => Date.parse(iso)
const iso = (instant: number | undefined) => instant === undefined ? undefined : new Date(instant).toISOString().replace(".000", "")

/** the next `count` instants after `from`, as ISO strings */
const nextRuns = (cron: CronSchedule, from: string, count: number) => {
  const runs: string[] = []
  let after = at(from)
  for (let index = 0; index < count; index++) {
    const next = cron.next(after)
    if (next === undefined) break
    runs.push(iso(next) ?? "")
    after = next
  }
  return runs
}

describe("CronSchedule", () => {
  test("finds the next run in the zone, strictly after the given instant", () => {
    const daily = schedule("30 6 * * *")
    // 06:30 in Vienna is 05:30 UTC in winter
    assert.equal(iso(daily.next(at("2026-11-02T05:00:00Z"))), "2026-11-02T05:30:00Z")
    assert.equal(iso(daily.next(at("2026-11-02T05:30:00Z"))), "2026-11-03T05:30:00Z")
    assert.equal(iso(daily.next(at("2026-07-01T00:00:00Z"))), "2026-07-01T04:30:00Z", "summer time")
    assert.equal(iso(schedule("30 6 * * *", new Zone("UTC")).next(at("2026-11-02T05:00:00Z"))), "2026-11-02T06:30:00Z")
  })

  test("weekdays and the previous run", () => {
    const workdays = schedule("0 7 * * MON-FRI")
    // Friday 2026-11-06 → Monday 2026-11-09
    assert.deepEqual(nextRuns(workdays, "2026-11-06T07:00:00Z", 2), ["2026-11-09T06:00:00Z", "2026-11-10T06:00:00Z"])
    assert.equal(iso(workdays.previous(at("2026-11-08T12:00:00Z"))), "2026-11-06T06:00:00Z")
    assert.equal(iso(workdays.previous(at("2026-11-09T06:00:00Z"))), "2026-11-09T06:00:00Z", "at counts as before")
  })

  test("a time skipped when DST starts runs at the first minute after the gap, once", () => {
    // Vienna 2026-03-29: 02:00 CET becomes 03:00 CEST (01:00 UTC)
    assert.deepEqual(nextRuns(schedule("30 2 * * *"), "2026-03-28T00:00:00Z", 3),
      ["2026-03-28T01:30:00Z", "2026-03-29T01:00:00Z", "2026-03-30T00:30:00Z"])
    assert.deepEqual(nextRuns(schedule("0,15,30,45 2 * * *"), "2026-03-29T00:00:00Z", 2), ["2026-03-29T01:00:00Z", "2026-03-30T00:00:00Z"],
      "four skipped times run once, at 03:00")
    assert.equal(iso(schedule("30 2 * * *").previous(at("2026-03-29T01:30:00Z"))), "2026-03-29T01:00:00Z")
  })

  test("a time repeated when DST ends runs once, at its first pass", () => {
    // Vienna 2026-10-25: 03:00 CEST becomes 02:00 CET; 02:30 happens at 00:30 and 01:30 UTC
    assert.deepEqual(nextRuns(schedule("30 2 * * *"), "2026-10-24T12:00:00Z", 2), ["2026-10-25T00:30:00Z", "2026-10-26T01:30:00Z"])
    assert.equal(iso(schedule("30 2 * * *").next(at("2026-10-25T00:30:00Z"))), "2026-10-26T01:30:00Z")
    assert.equal(iso(schedule("30 2 * * *").previous(at("2026-10-25T01:45:00Z"))), "2026-10-25T00:30:00Z")
  })

  test("with * as hour it follows real time: both passes of the repeated hour, nothing in the gap", () => {
    assert.deepEqual(nextRuns(schedule("30 * * * *"), "2026-10-24T23:00:00Z", 4),
      ["2026-10-24T23:30:00Z", "2026-10-25T00:30:00Z", "2026-10-25T01:30:00Z", "2026-10-25T02:30:00Z"])
    assert.deepEqual(nextRuns(schedule("30 * * * *"), "2026-03-29T00:00:00Z", 2), ["2026-03-29T00:30:00Z", "2026-03-29T01:30:00Z"],
      "01:30 CET, then 03:30 CEST; 02:30 doesn't exist")
    assert.deepEqual(nextRuns(schedule("*/20 * * * *"), "2026-10-25T00:30:00Z", 4),
      ["2026-10-25T00:40:00Z", "2026-10-25T01:00:00Z", "2026-10-25T01:20:00Z", "2026-10-25T01:40:00Z"])
    assert.equal(iso(schedule("30 * * * *").previous(at("2026-10-25T01:45:00Z"))), "2026-10-25T01:30:00Z")
  })

  test("29 February: the next leap year, also across 2100, which isn't one", () => {
    assert.equal(iso(schedule("0 12 29 2 *").next(at("2026-11-01T00:00:00Z"))), "2028-02-29T11:00:00Z")
    assert.equal(iso(schedule("0 12 29 2 *", new Zone("UTC")).next(at("2097-01-01T00:00:00Z"))), "2104-02-29T12:00:00Z")
    assert.equal(iso(schedule("0 12 29 2 *").previous(at("2027-01-01T00:00:00Z"))), "2024-02-29T11:00:00Z")
  })

  test("day of month OR day of week", () => {
    // Friday 2026-11-06 and Friday 2026-11-13; the 13th of December is a Sunday
    assert.deepEqual(nextRuns(schedule("0 8 13 * FRI", new Zone("UTC")), "2026-11-01T00:00:00Z", 6), [
      "2026-11-06T08:00:00Z", "2026-11-13T08:00:00Z", "2026-11-20T08:00:00Z", "2026-11-27T08:00:00Z",
      "2026-12-04T08:00:00Z", "2026-12-11T08:00:00Z"
    ])
    assert.deepEqual(nextRuns(schedule("0 8 13 * FRI", new Zone("UTC")), "2026-12-11T09:00:00Z", 2), ["2026-12-13T08:00:00Z", "2026-12-18T08:00:00Z"])
  })

  test("zones west of UTC and with half hours", () => {
    assert.equal(iso(schedule("0 0 * * *", new Zone("America/New_York")).next(at("2026-11-02T00:00:00Z"))), "2026-11-02T05:00:00Z")
    assert.equal(iso(schedule("0 9 * * *", new Zone("Asia/Kolkata")).next(at("2026-11-02T00:00:00Z"))), "2026-11-02T03:30:00Z")
    // New York 2026-03-08: 02:00 EST becomes 03:00 EDT, so 02:30 runs at 03:00 EDT (07:00 UTC)
    assert.equal(iso(schedule("30 2 * * *", new Zone("America/New_York")).next(at("2026-03-08T00:00:00Z"))), "2026-03-08T07:00:00Z")
    // New York 2026-11-01 01:30 happens twice; the first is 05:30 UTC
    assert.equal(iso(schedule("30 1 * * *", new Zone("America/New_York")).next(at("2026-11-01T00:00:00Z"))), "2026-11-01T05:30:00Z")
  })
})
