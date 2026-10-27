import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { IcsServer } from "../test-support/IcsServer.ts"
import { Zone } from "../time/Zone.ts"
import { IcsReader } from "./IcsReader.ts"

const NOW = new Date("2026-11-02T08:00:00Z")
const vienna = new IcsReader(new Zone("Europe/Vienna"))

/** VEVENT blocks */
const events = (...list: string[][]) => list.flatMap(event => ["BEGIN:VEVENT", "DTSTAMP:20261001T000000Z", ...event, "END:VEVENT"])
/** a minimal calendar around VEVENT lines */
const calendar = (...list: string[][]) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...events(...list), "END:VCALENDAR"].join("\r\n")
/** "start – end summary" per occurrence, in UTC */
const lines = (text: string) => vienna.read(text, NOW).occurrences.map(o => `${o.start.toISOString()} – ${o.end.toISOString()} ${o.summary}`)

describe("IcsReader with broken feeds", () => {
  test("a malformed RRULE leaves out that event only; series, overrides and time zones still work", () => {
    const bad = [
      ["UID:until", "DTSTART:20261103T100000Z", "RRULE:FREQ=WEEKLY;UNTIL=2026111", "SUMMARY:Bad until"],
      ["UID:interval", "DTSTART:20261103T100000Z", "RRULE:FREQ=WEEKLY;INTERVAL=0"],
      ["UID:byday", "DTSTART:20261103T100000Z", "RRULE:FREQ=WEEKLY;BYDAY=XX", "SUMMARY;LANGUAGE=de:Falscher", "  Tag"]
    ]
    // inserted before the weekly series' override, so splitting must keep a series' events together
    const text = IcsServer.fixture("weekly.ics").replace(/BEGIN:VEVENT\r?\nUID:training@lox-nexus.test\r?\nDTSTAMP:20261001T000000Z\r?\nRECURRENCE-ID/,
      match => [...events(...bad), match].join("\n"))
    const { occurrences, skipped } = vienna.read(text, NOW)
    assert.deepEqual(skipped, ["Bad until", "interval", "Falscher Tag"])
    assert.deepEqual(occurrences.map(o => `${o.start.toISOString()} ${o.summary}`), [
      "2026-11-02T17:00:00.000Z Training", "2026-11-04T18:00:00.000Z Club meeting", "2026-11-17T19:00:00.000Z Training (moved)",
      "2026-11-23T17:00:00.000Z Training", "2026-11-30T17:00:00.000Z Training"
    ])
  })

  test("events without UID get one from start and summary, the same on every read", () => {
    const text = calendar(["DTSTART:20261103T070000Z", "SUMMARY:Paper"], ["DTSTART:20261110T070000Z", "SUMMARY:Paper"])
    const first = vienna.read(text, NOW).occurrences
    const again = vienna.read(text, NOW).occurrences
    assert.equal(first.length, 2)
    assert.match(first[0]?.uid ?? "", /^nouid:[0-9a-f]{16}$/)
    assert.notEqual(first[0]?.uid, first[1]?.uid)
    assert.deepEqual(again.map(o => o.key), first.map(o => o.key))
  })

  test("an unreadable start or end is listed as left out", () => {
    const text = calendar(
      ["UID:end", "DTSTART:20261103T100000Z", "DTEND:2026110", "SUMMARY:Bad end"],
      ["UID:start", "DTSTART:2026110", "SUMMARY:Bad start"],
      ["UID:ok", "DTSTART:20261103T110000Z", "SUMMARY:Ok"]
    )
    const { occurrences, skipped } = vienna.read(text, NOW)
    assert.deepEqual([occurrences.map(o => o.summary), skipped], [["Ok"], ["Bad end", "Bad start"]])
  })

  test("a TZID nobody knows is read as local time in the plugin's zone; an end before the start becomes the start", () => {
    const text = calendar(
      ["UID:a", "DTSTART;TZID=Foo/Bar:20261103T090000", "DTEND;TZID=Foo/Bar:20261103T100000", "SUMMARY:Unknown zone"],
      ["UID:b", "DTSTART:20261104T100000Z", "DTEND:20261104T090000Z", "SUMMARY:Backwards"],
      ["UID:c", "DTSTART;TZID=America/New_York:20261105T090000", "DTEND:20261105T100000", "SUMMARY:Mixed"]
    )
    assert.deepEqual(lines(text), [
      "2026-11-03T08:00:00.000Z – 2026-11-03T09:00:00.000Z Unknown zone",
      "2026-11-04T10:00:00.000Z – 2026-11-04T10:00:00.000Z Backwards",
      "2026-11-05T14:00:00.000Z – 2026-11-05T14:00:00.000Z Mixed"
    ])
  })

  test("dense series keep their first 1000 occurrences, so other events stay in; the cut is reported", () => {
    const hourly = (n: number) => [`UID:h${n}`, "DTSTART:20261101T000000Z", "DTEND:20261101T001000Z", "RRULE:FREQ=HOURLY", `SUMMARY:Hourly ${n}`]
    const yearly = ["UID:y", "DTSTART;VALUE=DATE:20200815", "RRULE:FREQ=YEARLY", "SUMMARY:Anniversary"]
    const { occurrences, truncated } = vienna.read(calendar(hourly(1), hourly(2), hourly(3), yearly), NOW)
    assert.deepEqual(truncated, ["Hourly 1", "Hourly 2", "Hourly 3"])
    assert.equal(occurrences.filter(o => o.summary === "Hourly 2").length, IcsReader.MAX_PER_SERIES)
    assert.deepEqual(occurrences.filter(o => o.summary === "Anniversary").map(o => o.start.toISOString()), ["2027-08-14T22:00:00.000Z"])
  })

  test("beyond 20 000 occurrences in all, the far future is cut and reported", () => {
    // 60 daily series fill 20 000 occurrences after 333 days
    const daily = Array.from({ length: 60 }, (_, n) => [`UID:d${n}`, "DTSTART:20261101T060000Z", "RRULE:FREQ=DAILY", `SUMMARY:Daily ${n}`])
    const { occurrences, truncated } = vienna.read(calendar(...daily), NOW)
    assert.equal(occurrences.length, IcsReader.MAX_OCCURRENCES)
    assert.deepEqual(truncated, ["everything from 2027-10-01 on (more than 20000 occurrences)"])
  })
})
