import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { CronExpression } from "../cron/CronExpression.ts"
import { CronSchedule } from "../cron/CronSchedule.ts"
import { Zone } from "../time/Zone.ts"
import { Jitter } from "./Jitter.ts"
import { MergedSchedule } from "./MergedSchedule.ts"
import { Timeline } from "./Timeline.ts"

const utc = new Zone("UTC")
const timeline = (crons: string[], jitter: Jitter, zone = utc) =>
  new Timeline(new MergedSchedule(crons.map(cron => new CronSchedule(CronExpression.parse(cron), zone))), jitter)
const start = Date.parse("2026-11-02T00:00:00Z")

describe("Jitter", () => {
  test("whole seconds within ± the minutes, the same for the same seed and occurrence", () => {
    const jitter = new Jitter("seed:a", 15)
    const offsets = Array.from({ length: 200 }, (_, index) => jitter.offset(start + index * 60_000))
    assert.ok(offsets.every(offset => Math.abs(offset) <= 15 * 60_000 && offset % 1000 === 0))
    assert.ok(offsets.some(offset => offset < -10 * 60_000) && offsets.some(offset => offset > 10 * 60_000), "spread over the range")
    assert.equal(new Jitter("seed:a", 15).offset(start), jitter.offset(start))
    assert.notEqual(new Jitter("seed:b", 15).offset(start), jitter.offset(start))
    assert.equal(Jitter.NONE.offset(start), 0)
  })
})

describe("Timeline", () => {
  test("without an offset, the cron's instants", () => {
    const hourly = timeline(["0 * * * *"], Jitter.NONE)
    assert.deepEqual(hourly.next(start), { raw: start + 3_600_000, at: start + 3_600_000, index: 0 })
    assert.deepEqual(hourly.previous(start), { raw: start, at: start, index: 0 })
  })

  test("merged sources in time order; an instant both match belongs to the later one", () => {
    const window = timeline(["0 22 * * *", "0 6,22 * * *"], Jitter.NONE)
    assert.deepEqual(window.upcoming(start, 3).map(event => [new Date(event.at).toISOString().slice(11, 16), event.index]),
      [["06:00", 1], ["22:00", 1], ["06:00", 1]])
    const night = timeline(["0 22 * * *", "0 6 * * *"], Jitter.NONE)
    assert.deepEqual(night.upcoming(start, 2).map(event => event.index), [1, 0])
  })

  test("offsets never reorder events: each moves less than halfway to its neighbours", () => {
    // every minute with ± 10 minutes: at most ± 29 s
    const busy = timeline(["* * * * *"], new Jitter("seed", 10))
    const events = busy.upcoming(start, 200)
    assert.ok(events.every(event => Math.abs(event.at - event.raw) <= 29_000))
    assert.ok(events.some(event => Math.abs(event.at - event.raw) >= 20_000), "the offset is still used")
    assert.deepEqual(events.map(event => event.raw), events.map((_, index) => events[0]!.raw + index * 60_000), "in the scheduled order")
    assert.equal(busy.previous(events[50]!.at)?.raw, events[50]!.raw)
    assert.equal(busy.previous(events[50]!.at - 1)?.raw, events[49]!.raw)
  })

  test("a short window near midnight keeps its start before its end, whatever the draw", () => {
    // 23:50–00:10 with ± 30 minutes, for many seeds: towards each other the offset is cut to less than 10 minutes
    for (let seed = 0; seed < 50; seed++) {
      const window = timeline(["50 23 * * *", "10 0 * * *"], new Jitter(`seed-${seed}`, 30), new Zone("Europe/Vienna"))
      const events = window.upcoming(start, 20)
      assert.deepEqual(events.map(event => event.index), Array.from({ length: 20 }, (_, index) => index % 2), `seed ${seed}`)
      assert.ok(events.every((event, index) => index === 0 || event.at > events[index - 1]!.at))
      // towards each other less than halfway; away from each other the whole offset
      assert.ok(events.every(event => (event.index === 0 ? event.at - event.raw : event.raw - event.at) < 10 * 60_000))
    }
  })

  test("a long window uses the whole offset", () => {
    const window = timeline(["0 19 * * *", "0 23 * * *"], new Jitter("seed", 20))
    const offsets = window.upcoming(start, 40).map(event => event.at - event.raw)
    assert.ok(offsets.every(offset => Math.abs(offset) <= 20 * 60_000))
    assert.ok(offsets.some(offset => Math.abs(offset) > 15 * 60_000))
  })
})

describe("Zone", () => {
  const vienna = new Zone("Europe/Vienna")

  test("instants of a wall-clock time: one, two in the repeated hour, none in the gap; resolve picks first or after the gap", () => {
    assert.deepEqual(vienna.instants(Date.UTC(2026, 6, 1, 12)), [Date.parse("2026-07-01T10:00:00Z")])
    assert.deepEqual(vienna.instants(Date.UTC(2026, 9, 25, 2, 30)), [Date.parse("2026-10-25T00:30:00Z"), Date.parse("2026-10-25T01:30:00Z")])
    assert.deepEqual(vienna.instants(Date.UTC(2026, 2, 29, 2, 30)), [])
    assert.equal(vienna.resolve(Date.UTC(2026, 2, 29, 2, 30)), Date.parse("2026-03-29T01:00:00Z"))
    assert.equal(vienna.resolve(Date.UTC(2026, 9, 25, 2, 30)), Date.parse("2026-10-25T00:30:00Z"))
  })

  test("Loxone seconds count local time from 2009-01-01; names and formats", () => {
    assert.equal(vienna.loxoneSeconds(Date.parse("2008-12-31T23:00:00Z")), 0)
    assert.equal(vienna.loxoneSeconds(Date.parse("2026-07-15T10:00:00Z")), (Date.UTC(2026, 6, 15, 12) - Zone.LOXONE_EPOCH_MS) / 1000)
    assert.ok(Zone.isValid("America/New_York") && !Zone.isValid("Mars/Olympus"))
    assert.equal(vienna.dateTime(Date.parse("2026-11-02T23:30:00Z")), "Tue 2026-11-03 00:30")
  })
})
