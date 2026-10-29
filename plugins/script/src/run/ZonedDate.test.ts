import assert from "node:assert/strict"
import { describe, test } from "node:test"
import vm from "node:vm"
import { ScriptRealm } from "./ScriptRealm.ts"
import { ZonedDate } from "./ZonedDate.ts"

/** runs `code` in a fresh script context whose Date works in `zone` */
const run = (zone: string, code: string): unknown => {
  const realm = new ScriptRealm()
  realm.expose({ Date: new ZonedDate(zone).install(realm.Date) })
  const result: unknown = vm.runInContext(code, realm.context)
  // an array of the script's context has its own prototype, which deepStrictEqual compares
  return Array.isArray(result) ? [...result] : result
}
const vienna = (code: string) => run("Europe/Vienna", code)

describe("ZonedDate", () => {
  test("local getters and the offset follow the zone, in winter and in summer", () => {
    assert.deepEqual(vienna("const d = new Date(\"2026-01-15T12:00:00Z\"); [d.getHours(), d.getTimezoneOffset()]"), [13, -60])
    assert.deepEqual(vienna("const d = new Date(\"2026-07-15T23:30:00Z\"); [d.getDate(), d.getDay(), d.getHours(), d.getTimezoneOffset()]"), [16, 4, 1, -120])
    assert.equal(run("UTC", "new Date(0).getTimezoneOffset()"), 0)
  })

  test("local dates and times given to the constructor and Date.parse are the zone's", () => {
    assert.equal(vienna("new Date(2026, 9, 29, 10, 0).toISOString()"), "2026-10-29T09:00:00.000Z")
    assert.equal(vienna("new Date(\"2026-10-29T10:00\").toISOString()"), "2026-10-29T09:00:00.000Z")
    assert.equal(vienna("new Date(Date.parse(\"Oct 29 2026 10:00\")).toISOString()"), "2026-10-29T09:00:00.000Z")
    assert.equal(vienna("new Date(\"2026-10-29\").toISOString()"), "2026-10-29T00:00:00.000Z", "an ISO date alone is UTC")
    assert.equal(vienna("new Date(\"2026-10-29T10:00Z\").toISOString()"), "2026-10-29T10:00:00.000Z")
    assert.equal(vienna("new Date(\"2026-10-29T10:00+02:00\").toISOString()"), "2026-10-29T08:00:00.000Z")
    assert.equal(vienna("new Date(99, 0).getFullYear()"), 1999, "two-digit years as usual")
  })

  test("a time that occurs twice is the earlier one, a skipped one moves forward", () => {
    assert.equal(vienna("new Date(2026, 9, 25, 2, 30).toISOString()"), "2026-10-25T00:30:00.000Z")
    assert.equal(vienna("new Date(2026, 2, 29, 2, 30).toISOString()"), "2026-03-29T01:30:00.000Z")
  })

  test("setters change the local fields and keep the local time across a clock change", () => {
    assert.equal(vienna("const d = new Date(\"2026-03-28T12:00:00Z\"); d.setDate(29); d.toISOString()"), "2026-03-29T11:00:00.000Z")
    assert.equal(vienna("const d = new Date(\"2026-10-29T09:00:00Z\"); d.setHours(0, 0, 0, 0); d.toISOString()"), "2026-10-28T23:00:00.000Z")
    assert.equal(vienna("const d = new Date(NaN); d.setFullYear(2026); d.toISOString()"), "2025-12-31T23:00:00.000Z")
    assert.equal(vienna("const d = new Date(NaN); d.setHours(1); d.getTime()"), NaN)
  })

  test("texts show the zone's time and name; toLocale… defaults to the zone", () => {
    assert.equal(vienna("String(new Date(\"2026-10-29T09:00:00Z\"))"), "Thu Oct 29 2026 10:00:00 GMT+0100 (Central European Standard Time)")
    assert.equal(run("America/New_York", "new Date(\"2026-07-04T16:00:00Z\").toTimeString()"), "12:00:00 GMT-0400 (Eastern Daylight Time)")
    assert.equal(vienna("new Date(\"2026-10-29T09:00:00Z\").toLocaleTimeString(\"de-AT\")"), "10:00:00")
    assert.equal(vienna("new Date(\"2026-10-29T09:00:00Z\").toLocaleTimeString(\"de-AT\", { timeZone: \"UTC\" })"), "09:00:00")
    assert.equal(vienna("new Date(\"2026-10-29T09:00:00Z\").toDateString()"), "Thu Oct 29 2026")
    assert.equal(vienna("new Date(NaN).toString()"), "Invalid Date")
  })

  test("still the context's Date: instanceof, Date(), statics and JSON", () => {
    assert.deepEqual(vienna("const d = new Date(0); [d instanceof Date, d.constructor === Date, typeof Date(), typeof Date.now(), Date.UTC(2026, 0)]"),
      [true, true, "string", "number", Date.UTC(2026, 0)])
    assert.equal(vienna("JSON.stringify(new Date(0))"), "\"1970-01-01T00:00:00.000Z\"")
    assert.equal(vienna("class Later extends Date {}; new Later(2026, 0) instanceof Date"), true)
  })

  test("texts are local unless they carry an offset or zone, also odd ones V8 reads as local", () => {
    assert.equal(vienna("new Date(\"10-29-2026\").toISOString()"), "2026-10-28T23:00:00.000Z")
    assert.equal(vienna("new Date(\"Oct-29-2026\").toISOString()"), "2026-10-28T23:00:00.000Z")
    assert.equal(vienna("new Date(\" 2026-10-29\").toISOString()"), "2026-10-28T23:00:00.000Z", "only the strict ISO date is UTC")
    assert.equal(vienna("new Date(\"Oct 29 2026 10:00 EST\").toISOString()"), "2026-10-29T15:00:00.000Z")
    assert.equal(vienna("new Date(\"Thu Oct 29 2026 10:00:00 GMT+0100\").toISOString()"), "2026-10-29T09:00:00.000Z")
    assert.ok(Number.isNaN(vienna("Date.parse(\"not a date\")")))
  })

  test("the process's own zone plays no part, not even its clock changes", t => {
    const before = process.env.TZ
    // Node resets V8's zone cache when TZ changes
    process.env.TZ = "America/New_York"
    t.after(() => {
      if (before === undefined) delete process.env.TZ
      else process.env.TZ = before
    })
    // 02:30 doesn't exist in New York on that day, and exists in Vienna
    assert.equal(vienna("new Date(\"2026-03-08T02:30:00\").toISOString()"), "2026-03-08T01:30:00.000Z")
    assert.equal(vienna("new Date(\"Oct 29 2026 10:00\").getHours()"), 10)
    assert.equal(vienna("new Date(2026, 0, 1).getYear()"), 126)
  })

  test("getYear and setYear, and toLocale… with timeZone left undefined", () => {
    assert.equal(vienna("const d = new Date(2026, 5, 1); d.setYear(99); d.getFullYear()"), 1999)
    assert.equal(vienna("new Date(\"2025-12-31T23:30:00Z\").getYear()"), 126)
    assert.equal(vienna("new Date(\"2026-10-29T09:00:00Z\").toLocaleTimeString(\"de-AT\", { timeZone: undefined })"), "10:00:00")
    assert.throws(() => vienna("new Date(0).toLocaleString(\"de-AT\", null)"))
  })

  test("the methods check that this is a Date and throw the script's TypeError; overriding getTime changes nothing", () => {
    assert.equal(vienna("try { Date.prototype.getHours.call({ getTime: () => 0 }) } catch (e) { e instanceof TypeError }"), true)
    assert.equal(vienna("class Fixed extends Date { getTime() { return 0 } }; new Fixed(\"2026-10-29T09:00:00Z\").getHours()"), 10)
    assert.equal(vienna("Object.getOwnPropertyDescriptor(Date, \"parse\").value(\"2026-10-29T10:00\")"), Date.parse("2026-10-29T09:00:00Z"))
  })

  test("the edges of the date range don't throw", () => {
    assert.equal(vienna("typeof new Date(275760, 8, 12, 20).getTime()"), "number")
    assert.equal(vienna("new Date(-8.64e15).getTimezoneOffset()") !== undefined, true)
  })
})
