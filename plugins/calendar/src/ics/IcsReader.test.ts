import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { IcsServer } from "../test-support/IcsServer.ts"
import { Zone } from "../time/Zone.ts"
import { IcsReader } from "./IcsReader.ts"

const NOW = new Date("2026-11-02T08:00:00Z")
const vienna = new IcsReader(new Zone("Europe/Vienna"))

/** "start – end summary" per occurrence, in UTC */
const lines = (text: string, reader = vienna, now = NOW) =>
  reader.read(text, now).occurrences.map(o => `${o.start.toISOString()} – ${o.end.toISOString()} ${o.summary}`)

/** a minimal calendar around VEVENT lines */
const calendar = (...events: string[][]) => ["BEGIN:VCALENDAR", "VERSION:2.0",
  ...events.flatMap(event => ["BEGIN:VEVENT", "DTSTAMP:20261001T000000Z", ...event, "END:VEVENT"]), "END:VCALENDAR"].join("\r\n")

describe("IcsReader", () => {
  test("expands a weekly series: EXDATE removes an occurrence, RECURRENCE-ID moves one", () => {
    assert.deepEqual(lines(IcsServer.fixture("weekly.ics")), [
      "2026-11-02T17:00:00.000Z – 2026-11-02T18:00:00.000Z Training",
      "2026-11-04T18:00:00.000Z – 2026-11-04T20:00:00.000Z Club meeting",
      // 2026-11-09 is excluded; 2026-11-16 18:00 moved to Tuesday 20:00–21:30 with its own title
      "2026-11-17T19:00:00.000Z – 2026-11-17T20:30:00.000Z Training (moved)",
      "2026-11-23T17:00:00.000Z – 2026-11-23T18:00:00.000Z Training",
      "2026-11-30T17:00:00.000Z – 2026-11-30T18:00:00.000Z Training"
    ])
    const [first, , moved] = vienna.read(IcsServer.fixture("weekly.ics"), NOW).occurrences
    assert.equal(first?.uid, moved?.uid, "occurrences of a series share the UID")
    assert.notEqual(first?.key, moved?.key, "but each has its own key")
    assert.deepEqual([moved?.location, first?.description], ["Gym", ""])
  })

  test("all-day events run from local midnight to local midnight in the plugin's zone, also yearly ones", () => {
    const expected = [
      "2026-11-03T23:00:00.000Z – 2026-11-04T23:00:00.000Z Public holiday",
      "2026-11-05T23:00:00.000Z – 2026-11-07T23:00:00.000Z Vacation",
      "2026-11-09T23:00:00.000Z – 2026-11-10T23:00:00.000Z Birthday",
      "2027-11-09T23:00:00.000Z – 2027-11-10T23:00:00.000Z Birthday"
    ]
    assert.deepEqual(lines(IcsServer.fixture("all-day.ics")), expected)
    assert.ok(vienna.read(IcsServer.fixture("all-day.ics"), NOW).occurrences.every(o => o.allDay))
    // the server's own zone must not matter (a container often runs in UTC)
    const saved = process.env.TZ
    try {
      process.env.TZ = "America/Los_Angeles"
      assert.deepEqual(lines(IcsServer.fixture("all-day.ics")), expected)
    } finally {
      if (saved === undefined) delete process.env.TZ
      else process.env.TZ = saved
    }
    const tokyo = new IcsReader(new Zone("Asia/Tokyo"))
    assert.equal(lines(IcsServer.fixture("all-day.ics"), tokyo)[0], "2026-11-03T15:00:00.000Z – 2026-11-04T15:00:00.000Z Public holiday")
  })

  test("times with a TZID keep their zone, Windows zone names included; floating times use the calendar's zone", () => {
    assert.deepEqual(lines(IcsServer.fixture("timezone.ics")), [
      "2026-11-03T14:00:00.000Z – 2026-11-03T15:00:00.000Z Call with New York",
      "2026-11-05T09:00:00.000Z – 2026-11-05T10:00:00.000Z Outlook meeting",
      // the feed defines New York as its zone, so its floating 12:00 is New York noon
      "2026-11-06T17:00:00.000Z – 2026-11-06T18:00:00.000Z Floating lunch"
    ])
  })

  test("floating times in a calendar without a zone are wall-clock times in the plugin's zone", () => {
    const text = calendar(["UID:f", "DTSTART:20261106T120000", "DTEND:20261106T130000", "SUMMARY:Lunch"])
    assert.deepEqual(lines(text), ["2026-11-06T11:00:00.000Z – 2026-11-06T12:00:00.000Z Lunch"])
  })

  test("keeps occurrences that are still running or ended within a day, drops older ones and cancelled ones", () => {
    const text = calendar(
      ["UID:long", "DTSTART:20261020T000000Z", "DTEND:20261110T000000Z", "SUMMARY:Long"],
      ["UID:old", "DTSTART:20261030T000000Z", "DTEND:20261030T010000Z", "SUMMARY:Old"],
      ["UID:recent", "DTSTART:20261101T120000Z", "DTEND:20261101T130000Z", "SUMMARY:Recent"],
      ["UID:cancelled", "DTSTART:20261105T120000Z", "DTEND:20261105T130000Z", "STATUS:CANCELLED", "SUMMARY:Off"],
      ["UID:far", "DTSTART:20280101T120000Z", "SUMMARY:Far"]
    )
    assert.deepEqual(vienna.read(text, NOW).occurrences.map(o => o.summary), ["Long", "Recent"])
  })

  test("a rule that repeats too often is left out by name; the rest is read", () => {
    const text = calendar(
      ["UID:spam", "DTSTART:20261101T000000Z", "DTEND:20261101T000100Z", "RRULE:FREQ=MINUTELY", "SUMMARY:Every minute"],
      ["UID:ok", "DTSTART:20261103T070000Z", "SUMMARY:Fine"]
    )
    const { occurrences, skipped } = vienna.read(text, NOW)
    assert.deepEqual(skipped, ["Every minute"])
    assert.deepEqual(occurrences.map(o => o.summary), ["Fine"])
  })

  test("refuses text that isn't a calendar", () => {
    assert.throws(() => vienna.read("<html><body>Login</body></html>", NOW), /not an iCalendar feed \(starts with "<html>/)
  })
})

test("a parsed feed can be expanded again later: the window moves, the skipped list doesn't grow", () => {
  const text = calendar(["UID:daily", "SUMMARY:Daily", "DTSTART:20261001T090000Z", "DTEND:20261001T100000Z", "RRULE:FREQ=DAILY"], ["UID:broken", "SUMMARY:Broken"])
  const feed = vienna.parse(text)
  const now = vienna.occurrences(feed, NOW)
  const later = vienna.occurrences(feed, new Date(NOW.getTime() + 30 * 24 * 3_600_000))
  assert.deepEqual(now.occurrences, vienna.read(text, NOW).occurrences)
  assert.ok(later.occurrences[0]!.start.getTime() > now.occurrences[0]!.start.getTime(), "a month later starts later")
  assert.deepEqual(later.skipped, now.skipped)
  assert.deepEqual(feed.skipped, vienna.parse(text).skipped)
})
