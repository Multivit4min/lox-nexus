import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { TimeFormat } from "./TimeFormat.ts"
import { Zone } from "./Zone.ts"

describe("Zone", () => {
  const vienna = new Zone("Europe/Vienna")

  test("finds the instant of a wall-clock time, also around DST changes", () => {
    assert.equal(vienna.instant({ year: 2026, month: 11, day: 4 }).toISOString(), "2026-11-03T23:00:00.000Z")
    assert.equal(vienna.instant({ year: 2026, month: 7, day: 1, hour: 12 }).toISOString(), "2026-07-01T10:00:00.000Z")
    // 2026-03-29 02:30 doesn't exist in Vienna; 2026-10-25 02:30 happens twice
    assert.equal(vienna.instant({ year: 2026, month: 3, day: 29, hour: 2, minute: 30 }).toISOString(), "2026-03-29T01:30:00.000Z")
    assert.equal(vienna.instant({ year: 2026, month: 10, day: 25, hour: 2, minute: 30 }).toISOString(), "2026-10-25T00:30:00.000Z")
    assert.equal(new Zone("UTC").instant({ year: 2026, month: 1, day: 1 }).toISOString(), "2026-01-01T00:00:00.000Z")
  })

  test("Loxone seconds count local time from 2009-01-01, so they follow DST", () => {
    assert.equal(vienna.loxoneSeconds(new Date("2008-12-31T23:00:00Z")), 0)
    const winter = new Date("2026-01-15T11:00:00Z")
    const summer = new Date("2026-07-15T10:00:00Z")
    assert.equal(vienna.loxoneSeconds(winter), (Date.UTC(2026, 0, 15, 12) - Zone.LOXONE_EPOCH_MS) / 1000)
    assert.equal(vienna.loxoneSeconds(summer), (Date.UTC(2026, 6, 15, 12) - Zone.LOXONE_EPOCH_MS) / 1000)
  })

  test("validates names and formats dates", () => {
    assert.ok(Zone.isValid("America/New_York"))
    assert.ok(!Zone.isValid("Mars/Olympus"))
    assert.equal(vienna.dateTime(new Date("2026-11-02T23:30:00Z")), "2026-11-03 00:30")
  })
})

describe("TimeFormat", () => {
  const minutes = new TimeFormat("minutesUntil", new Zone("UTC"))
  const at = new Date("2026-11-03T07:00:00Z")
  const now = (iso: string) => Date.parse(iso)

  test("whole minutes rounded up, never -0, with the moment the number changes next", () => {
    assert.equal(minutes.value(at, now("2026-11-03T06:58:59Z")), 2)
    assert.equal(minutes.nextChange(at, now("2026-11-03T06:58:59Z")), now("2026-11-03T06:59:00Z"))
    assert.ok(Object.is(minutes.value(at, now("2026-11-03T07:00:00Z")), 0))
    assert.equal(minutes.value(at, now("2026-11-03T07:00:30Z")), 0)
    assert.equal(minutes.value(at, now("2026-11-03T07:01:00Z")), -1)
    assert.equal(minutes.nextChange(at, now("2026-11-03T07:00:30Z")), now("2026-11-03T07:01:00Z"))
  })

  test("without an event: a value no real one reaches for minutes, 0 for dates", () => {
    assert.equal(minutes.value(undefined, 0), TimeFormat.NONE_MINUTES)
    assert.equal(minutes.nextChange(undefined, 0), undefined)
    assert.equal(new TimeFormat("unix", new Zone("UTC")).value(undefined, 0), 0)
    assert.equal(new TimeFormat("loxone", new Zone("UTC")).value(undefined, 0), 0)
  })
})
