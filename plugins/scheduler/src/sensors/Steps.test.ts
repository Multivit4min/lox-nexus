import assert from "node:assert/strict"
import { afterEach, describe, test } from "node:test"
import { cellText } from "@lox-nexus/plugin-sdk/testing"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { SchedulerHarness } from "../test-support/SchedulerHarness.ts"

const step = (time: string, value: unknown, weekdays?: string[]) => ({ trigger: "time", time, value, ...(weekdays ? { weekdays } : {}) })
const WORKDAYS = ["mon", "tue", "wed", "thu", "fri"]
const n = (value: number) => Value.number(value)

describe("value steps", () => {
  let h: SchedulerHarness
  afterEach(() => h.cleanup())

  test("at start the latest passed step's value, then each step's value at its time, in time order whatever the list order", async () => {
    h = new SchedulerHarness("2026-11-02T11:00:00Z") // Monday 12:00 in Vienna
    const host = await h.start()
    const setpoint = await host.addSensor("value-number", { steps: [step("22:00", 18), step("07:00", 21, WORKDAYS)] })
    assert.deepEqual(host.values(setpoint), [n(21)], "07:00 passed today")
    await h.advanceTo("2026-11-02T21:00:00Z")
    assert.deepEqual(host.values(setpoint), [n(21), n(18)])
    await h.advanceTo("2026-11-07T21:00:00Z") // to Saturday 22:00: no 07:00 on Saturday
    assert.deepEqual(host.values(setpoint), [n(21), n(18), n(21), n(18), n(21), n(18), n(21), n(18), n(21), n(18)])
  })

  test("each type; a moment two steps share belongs to the later one in the list", async () => {
    h = new SchedulerHarness()
    const host = await h.start()
    const mode = await host.addSensor("value-text", { steps: [step("07:00", "day"), step("07:00", "school", WORKDAYS), step("22:00", "night")] })
    const light = await host.addSensor("value-boolean", { steps: [step("07:00", true), step("08:30", false)] })
    assert.deepEqual([host.values(mode), host.values(light)], [[Value.string("school")], [Value.boolean(false)]], "Monday 09:00, after 08:30")
    await h.advanceTo("2026-11-07T06:00:00Z") // Saturday 07:00
    assert.deepEqual(host.values(mode).at(-1), Value.string("day"))
    assert.deepEqual(host.values(light).at(-1), Value.boolean(true))
  })

  test("a single step reaches its target once: an unchanged value isn't sent again", async () => {
    h = new SchedulerHarness()
    const host = await h.start()
    const once = await host.addSensor("value-number", { steps: [step("10:00", 21)] })
    await h.advanceTo("2026-11-05T09:00:00Z")
    assert.deepEqual(host.values(once), [n(21)])
  })

  test("random offsets never reorder steps, also around midnight", async () => {
    h = new SchedulerHarness()
    // a fixed seed, so the draws are the same in every run of the test; the 8 schedules still draw differently
    const host = await h.start({ store: { seed: "0123456789abcdef0123456789abcdef" } })
    const ids: string[] = []
    for (let index = 0; index < 8; index++) {
      ids.push(await host.addSensor("value-number", { steps: [step("23:55", 1), step("00:05", 2)], randomMinutes: 60 }))
    }
    // Friday 03:00 in Vienna: past Friday's 00:05 step with any offset, before Friday's 23:55
    await h.advanceTo("2026-11-06T02:00:00Z")
    for (const id of ids) {
      const values = host.values(id).map(value => (value as { value: number }).value)
      assert.deepEqual(values, [2, 1, 2, 1, 2, 1, 2, 1, 2], id)
    }
    const offsets = ids.map(id => (host.plugin.schedules.get(id)?.next(h.clock.now())?.at ?? 0) - Date.parse("2026-11-06T22:55:00Z"))
    assert.ok(offsets.every(offset => offset < 5 * 60_000 && offset >= -60 * 60_000), "towards 00:05 less than halfway, away the whole hour")
    assert.ok(offsets.some(offset => offset < -5 * 60_000), "away from its neighbour a step uses the offset")
  })

  test("daylight saving in Vienna: a step at a skipped time comes at 03:00, a repeated one once", async () => {
    h = new SchedulerHarness("2027-03-27T12:00:00Z")
    let host = await h.start()
    let mode = await host.addSensor("value-text", { steps: [step("02:30", "early"), step("12:00", "noon")] })
    await h.advanceTo("2027-03-28T00:59:59Z")
    assert.deepEqual(host.values(mode), [Value.string("noon")])
    await h.advanceTo("2027-03-28T01:00:00Z") // 03:00 CEST
    assert.deepEqual(host.values(mode).at(-1), Value.string("early"))
    await h.stop(host)
    h.clock.jump(Date.parse("2027-10-30T12:00:00Z") - h.clock.now())
    host = await h.start()
    mode = await host.addSensor("value-text", { steps: [step("02:30", "early"), step("02:45", "later")] })
    await h.advanceTo("2027-10-31T00:30:00Z") // 02:30 CEST, the first pass
    assert.deepEqual(host.values(mode), [Value.string("later"), Value.string("early")])
    await h.advanceTo("2027-10-31T02:00:00Z")
    assert.deepEqual(host.values(mode), [Value.string("later"), Value.string("early"), Value.string("later")], "the second pass runs nothing")
  })

  test("Run now brings the next step forward; Skip next skips it, the value before stays until the step after", async () => {
    h = new SchedulerHarness()
    const host = await h.start()
    const steps = { steps: [step("07:00", 21), step("12:00", 22), step("22:00", 18)] }
    const setpoint = await host.addSensor("value-number", steps, "Heating")
    assert.match(await host.action("run-now", { schedule: setpoint }) ?? "", /^"Heating" sent 22 now, its next step \(Mon 2026-11-02 12:00\)$/)
    assert.deepEqual(host.values(setpoint), [n(21), n(22)])
    await h.advanceTo("2026-11-02T11:00:00Z")
    assert.deepEqual(host.values(setpoint), [n(21), n(22)], "the step itself changes nothing")
    await host.actuate(await host.addActuator("skip-next", {}), Value.boolean(true))
    await h.advanceTo("2026-11-02T21:00:00Z")
    assert.deepEqual(host.values(setpoint), [n(21), n(22)], "22:00 skipped: 22 stays")
    await h.advanceTo("2026-11-03T06:00:00Z")
    assert.deepEqual(host.values(setpoint), [n(21), n(22), n(21)])
  })

  test("switched off it sends nothing; on again, the current step's value", async () => {
    h = new SchedulerHarness()
    const host = await h.start()
    const setpoint = await host.addSensor("value-number", { steps: [step("07:00", 21), step("22:00", 18)], group: "heat" })
    const enabled = await host.addActuator("enabled", { group: "heat" })
    await host.actuate(enabled, Value.boolean(false))
    await h.advanceTo("2026-11-02T22:00:00Z")
    assert.deepEqual(host.values(setpoint), [n(21)])
    await host.actuate(enabled, Value.boolean(true))
    assert.deepEqual(host.values(setpoint), [n(21), n(18)])
  })

  test("the panel and Next runs show each step's value; long summaries are shortened", async () => {
    h = new SchedulerHarness()
    const host = await h.start()
    await host.addSensor("value-number", { steps: [step("07:00", 21, WORKDAYS), step("22:00", 18)] }, "Heating")
    const many = Array.from({ length: 6 }, (_, index) => step(`1${index}:00`, `mode ${index}`))
    const modes = await host.addSensor("value-text", { steps: many }, "Modes")
    const panel = await host.panel()
    const rows = panel?.type === "sections" && panel.sections[1]?.panel.type === "table" ? panel.sections[1].panel.rows : []
    assert.deepEqual(rows.map(row => [cellText(row[0]), cellText(row[2]), cellText(row[4]), cellText(row[5])]), [
      ["Heating", "07:00 Mon–Fri → 21; 22:00 daily → 18", "Mon 2026-11-02 22:00 → 18", rows[0] && cellText(rows[0][5])],
      ["Modes", "10:00 daily → \"mode 0\"; … (6 steps)", "Mon 2026-11-02 10:00 → \"mode 0\"", rows[1] && cellText(rows[1][5])]
    ])
    assert.notEqual(cellText(rows[0]?.[5]), "never", "the last step that passed")
    const lines = (await host.action("next-runs", { source: "schedule", schedule: modes }))?.split("\n") ?? []
    assert.deepEqual(lines.slice(1, 3), ["Mon 2026-11-02 10:00 → \"mode 0\"", "Mon 2026-11-02 11:00 → \"mode 1\""])
  })
})

describe("value steps: Run now, skips and clock steps", () => {
  let h: SchedulerHarness
  afterEach(() => h.cleanup())
  const steps = { steps: [step("07:00", 21), step("12:00", 22), step("22:00", 18)] }

  test("Run now then Skip next of the held step: the value before comes back at once", async () => {
    h = new SchedulerHarness()
    const host = await h.start()
    const setpoint = await host.addSensor("value-number", steps, "Heating")
    await host.action("run-now", { schedule: setpoint })
    assert.deepEqual(host.values(setpoint), [n(21), n(22)])
    assert.equal(await host.action("skip", { schedule: setpoint, skip: true }), "\"Heating\" skips its next run")
    assert.deepEqual(host.values(setpoint), [n(21), n(22), n(21)])
    await h.advanceTo("2026-11-02T11:00:00Z")
    assert.deepEqual(host.values(setpoint), [n(21), n(22), n(21)], "12:00 skipped")
  })

  test("Run now says so when the next step sends what holds already", async () => {
    h = new SchedulerHarness()
    const host = await h.start()
    const same = await host.addSensor("value-number", { steps: [step("07:00", 21), step("12:00", 21), step("22:00", 18)] }, "Flat")
    assert.equal(await host.action("run-now", { schedule: same }), "\"Flat\" already sends 21, the value of its next step (Mon 2026-11-02 12:00); nothing changed")
    assert.deepEqual(host.values(same), [n(21)])
  })

  test("a skipped step stays skipped across a restart", async () => {
    h = new SchedulerHarness()
    let host = await h.start()
    await host.addSensor("value-number", steps)
    await host.actuate(await host.addActuator("skip-next", {}), Value.boolean(true))
    host = await h.restart(host)
    const setpoint = await host.addSensor("value-number", steps)
    await h.advanceTo("2026-11-02T20:00:00Z")
    assert.deepEqual(host.values(setpoint), [n(21)], "12:00 skipped after the restart too")
    await h.advanceTo("2026-11-02T21:00:00Z")
    assert.deepEqual(host.values(setpoint), [n(21), n(18)])
  })

  test("a large clock step back drops a value held by Run now", async () => {
    h = new SchedulerHarness()
    const host = await h.start()
    const setpoint = await host.addSensor("value-number", { steps: [step("07:00", 21), step("22:00", 18)] })
    await host.action("run-now", { schedule: setpoint })
    assert.deepEqual(host.values(setpoint), [n(21), n(18)], "22:00 brought forward")
    h.clock.jump(-2 * 3_600_000) // Monday 07:00 again
    await h.clock.advance(60_000)
    assert.deepEqual(host.values(setpoint), [n(21), n(18), n(21)], "back to the step that holds at the new time")
  })

  test("steps moved onto one instant by the DST gap: the latest meant time wins, whatever the list order", async () => {
    h = new SchedulerHarness("2027-03-27T12:00:00Z")
    const host = await h.start()
    const gap = await host.addSensor("value-text", { steps: [step("02:45", "02:45"), step("03:00", "03:00"), step("02:15", "02:15"), step("12:00", "noon")] })
    const inside = await host.addSensor("value-text", { steps: [step("02:45", "02:45"), step("02:15", "02:15"), step("12:00", "noon")] })
    await h.advanceTo("2027-03-28T01:00:00Z") // 03:00 CEST
    assert.deepEqual(host.values(gap), [Value.string("noon"), Value.string("03:00")])
    assert.deepEqual(host.values(inside), [Value.string("noon"), Value.string("02:45")], "02:45 was meant later than 02:15")
    await h.advanceTo("2027-03-29T00:15:00Z") // the next day, 02:15 CEST exists again
    assert.deepEqual(host.values(inside).slice(2), [Value.string("noon"), Value.string("02:15")])
  })
})
