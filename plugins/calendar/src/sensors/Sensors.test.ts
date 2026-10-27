import assert from "node:assert/strict"
import { after, afterEach, before, describe, mock, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { CalendarHarness } from "../test-support/CalendarHarness.ts"
import { TimeFormat } from "../time/TimeFormat.ts"

// single.ics: "Waste collection" 2026-11-03 07:00–08:00 UTC, description "Put the bins out", location "Main Street"
describe("calendar sensors", { timeout: 20_000 }, () => {
  let h: CalendarHarness
  before(async () => {
    h = await CalendarHarness.create()
    h.server.serve("/single.ics", "single.ics").serve("/weekly.ics", "weekly.ics")
  })
  afterEach(() => h.cleanup())
  after(() => h.close())

  test("active follows the event from start − lead until end + lag, with the end counting (old bug: end ignored)", async () => {
    const host = await h.started("/single.ics")
    const plain = await host.addSensor("active")
    const padded = await host.addSensor("active", { leadMinutes: 30, lagMinutes: 15 })
    assert.deepEqual([host.values(plain), host.values(padded)], [[Value.boolean(false)], [Value.boolean(false)]])
    h.advanceTo("2026-11-03T06:30:00Z")
    assert.deepEqual(host.values(padded).at(-1), Value.boolean(true), "active exactly when the lead begins")
    assert.deepEqual(host.values(plain).at(-1), Value.boolean(false))
    h.advanceTo("2026-11-03T07:00:00Z")
    assert.deepEqual(host.values(plain).at(-1), Value.boolean(true))
    h.advanceTo("2026-11-03T07:59:59Z")
    assert.deepEqual(host.values(plain).at(-1), Value.boolean(true), "still active just before the end")
    h.advanceTo("2026-11-03T08:00:00Z")
    assert.deepEqual(host.values(plain).at(-1), Value.boolean(false), "inactive exactly at the end")
    assert.deepEqual(host.values(padded).at(-1), Value.boolean(true), "the lag keeps it active")
    h.advanceTo("2026-11-03T08:15:00Z")
    assert.deepEqual(host.values(padded).at(-1), Value.boolean(false))
    assert.equal(host.values(plain).length, 3, "one value per transition, no polling in between")
  })

  test("title sends the current or next event's summary, description or location, and \"\" without one", async () => {
    const host = await h.started("/single.ics")
    const current = await host.addSensor("title")
    const next = await host.addSensor("title", { which: "next" })
    const where = await host.addSensor("title", { which: "next", show: "location" })
    const what = await host.addSensor("title", { show: "description" })
    assert.deepEqual([current, next, where, what].map(id => host.values(id).at(-1)),
      [Value.string(""), Value.string("Waste collection"), Value.string("Main Street"), Value.string("")])
    h.advanceTo("2026-11-03T07:00:00Z")
    assert.deepEqual([current, next, where, what].map(id => host.values(id).at(-1)),
      [Value.string("Waste collection"), Value.string(""), Value.string(""), Value.string("Put the bins out")])
  })

  test("time counts the minutes down, minute by minute, and turns negative once passed", async () => {
    const host = await h.started("/single.ics", { now: "2026-11-03T06:57:30Z" })
    const start = await host.addSensor("time", { which: "nextStart" })
    const currentStart = await host.addSensor("time", { which: "currentStart" })
    assert.deepEqual(host.values(start), [Value.number(3)], "2.5 minutes round up to 3")
    assert.deepEqual(host.values(currentStart), [Value.number(TimeFormat.NONE_MINUTES)])
    h.advanceTo("2026-11-03T07:00:00Z")
    assert.deepEqual(host.values(start).slice(1), [Value.number(2), Value.number(1), Value.number(TimeFormat.NONE_MINUTES)])
    assert.deepEqual(host.values(currentStart).at(-1), Value.number(0))
    h.advanceTo("2026-11-03T07:02:00Z")
    assert.deepEqual(host.values(currentStart).slice(1), [Value.number(0), Value.number(-1), Value.number(-2)])
  })

  test("time as unix seconds and as Loxone seconds since 2009 in local time; 0 without an event", async () => {
    const host = await h.started("/single.ics")
    const unix = await host.addSensor("time", { which: "nextEnd", format: "unix" })
    const loxone = await host.addSensor("time", { which: "nextStart", format: "loxone" })
    const none = await host.addSensor("time", { which: "currentEnd", format: "loxone" })
    assert.deepEqual(host.values(unix), [Value.number(Date.parse("2026-11-03T08:00:00Z") / 1000)])
    // 07:00 UTC is 08:00 in Vienna; Loxone counts local seconds from 2009-01-01 00:00
    assert.deepEqual(host.values(loxone), [Value.number((Date.UTC(2026, 10, 3, 8) - Date.UTC(2009, 0, 1)) / 1000)])
    assert.deepEqual(host.values(none), [Value.number(0)])
  })

  test("filters match text ignoring case, in a chosen field or any, or as a regular expression", async () => {
    const host = await h.started("/weekly.ics")
    const title = (params: object) => host.addSensor("title", { which: "next", ...params })
    const ids = await Promise.all([
      title({}), title({ match: "MEETING" }), title({ match: "clubhouse", field: "location" }),
      title({ match: "annual", field: "any" }), title({ match: "^training$", regex: true }),
      title({ match: "gym" }), title({ match: "moved\\)$", regex: true })
    ])
    assert.deepEqual(ids.map(id => host.values(id)[0]), [
      Value.string("Training"), Value.string("Club meeting"), Value.string("Club meeting"),
      Value.string("Club meeting"), Value.string("Training"), Value.string(""), Value.string("Training (moved)")
    ])
    await assert.rejects(host.addSensor("active", { match: "(unclosed", regex: true }), /not a valid regular expression/)
    await assert.rejects(host.addSensor("active", { lagMinutes: 2000 }), /invalid params/)
  })

  test("a step of the wall clock is caught up within 15 minutes, not at the next read", async () => {
    const host = await h.started("/single.ics", { config: { refreshMinutes: 10_080 } })
    const active = await host.addSensor("active")
    // NTP sets the wall clock forward into the event; timers run on a monotonic clock and don't
    // notice (mock.timers.setTime would move both, so only Date.now is shifted)
    const monotonic = Date.now.bind(Date)
    const step = Date.parse("2026-11-03T07:10:00Z") - monotonic()
    const wall = mock.method(Date, "now", () => monotonic() + step)
    try {
      mock.timers.tick(14 * 60_000)
      assert.deepEqual(host.values(active), [Value.boolean(false)])
      mock.timers.tick(60_000)
      assert.deepEqual(host.values(active), [Value.boolean(false), Value.boolean(true)])
    } finally {
      wall.mock.restore()
    }
  })

  test("nothing is sent before the calendar was read once", async () => {
    const release = h.server.hold()
    const host = await h.start("/single.ics")
    const active = await host.addSensor("active")
    assert.deepEqual(host.values(active), [])
    release()
    await CalendarHarness.plugin(host).source.refresh()
    assert.deepEqual(host.values(active), [Value.boolean(false)])
  })
})
