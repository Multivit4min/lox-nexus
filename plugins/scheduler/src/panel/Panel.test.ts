import assert from "node:assert/strict"
import { afterEach, describe, test } from "node:test"
import type { Panel } from "@lox-nexus/plugin-sdk"
import { cellText } from "@lox-nexus/plugin-sdk/testing"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { SchedulerHarness } from "../test-support/SchedulerHarness.ts"

type Sections = Extract<Panel, { type: "sections" }>["sections"]

const sections = (panel: Panel | undefined): Sections => panel?.type === "sections" ? panel.sections : []
const table = (panel: Panel | undefined) => {
  const part = sections(panel)[1]?.panel
  return part?.type === "table" ? part : undefined
}

describe("panel, actions and catalog", () => {
  let h: SchedulerHarness
  afterEach(() => h.cleanup())

  test("a table of schedules with the next run counting down, the last run and the state", async () => {
    h = new SchedulerHarness()
    const host = await h.start()
    assert.equal(sections(await host.panel())[1]?.panel.type, "notice", "no schedules yet")
    await host.addSensor("pulse", { trigger: "time", time: "06:30", weekdays: ["mon", "tue", "wed", "thu", "fri"], group: "blinds" }, "Blinds up")
    await host.addSensor("window", { trigger: "time", start: "22:00", end: "06:00", randomMinutes: 10 }, "Night")
    await host.addSensor("next-run", { trigger: "cron", cron: "0 7 * * *" }, "Breakfast")
    await host.actuate(await host.addActuator("skip-next", { group: "blinds" }), Value.boolean(true))
    const rows = table(await host.panel())
    assert.deepEqual(rows?.columns, ["Schedule", "Kind", "When", "Group", "Next", "Last run", "State"])
    assert.deepEqual(rows?.rows.map(row => row.map(cellText)), [
      ["Blinds up", "Pulse", "06:30 Mon–Fri", "blinds", "Wed 2026-11-04 06:30", "never", "skips next"],
      ["Breakfast", "Next run", "cron 0 7 * * *", "", "Tue 2026-11-03 07:00", "never", "enabled"],
      ["Night", "Window", "22:00–06:00 daily ± 10 min", "", rows?.rows[2]?.[4] && cellText(rows.rows[2][4]), "never", "enabled, off"]
    ])
    assert.match(cellText(rows?.rows[2]?.[4]), /^on Mon 2026-11-02 2[12]:\d\d$/)
    const next = rows?.rows[0]?.[4]
    assert.equal(typeof next === "object" ? next.until : undefined, Date.parse("2026-11-04T05:30:00Z"), "a live countdown")
    assert.deepEqual(rows?.rows.map(row => typeof row[6] === "object" ? row[6].tone : undefined), ["warn", "ok", "info"])
    assert.deepEqual(rows?.rowActions?.[0]?.map(action => [action.action, action.label]), [["run-now", "Run now"], ["skip", "Don't skip"], ["next-runs", "Next runs"]])
    assert.deepEqual(rows?.rowActions?.[1]?.map(action => action.action), ["skip", "next-runs"], "a next-run sensor has nothing to run")
    assert.deepEqual(rows?.rowCatalog, ["group:blinds", "all", "all"])
  })

  test("switches for all schedules and each group, which the panel's switch action flips", async () => {
    h = new SchedulerHarness()
    const host = await h.start({ config: { timeZone: "Europe/Berlin" } })
    await host.addSensor("pulse", { trigger: "time", time: "06:30", group: "blinds" })
    const items = async () => {
      const part = sections(await host.panel())[0]?.panel
      return part?.type === "keyValue" ? part.items.map(item => [item.label, cellText(item.value), item.control?.switch?.checked]) : []
    }
    assert.deepEqual(await items(), [["Time zone", "Europe/Berlin", undefined], ["All schedules", "on", true], ["Group \"blinds\"", "on", true]])
    assert.equal(await host.action("set-enabled", { group: "blinds", enabled: false }), "Switched group \"blinds\" off")
    assert.equal(await host.action("set-enabled", { group: "blinds", enabled: false }), "group \"blinds\" were already off")
    assert.deepEqual((await items())[2], ["Group \"blinds\"", "off", false])
    const row = table(await host.panel())?.rows[0]
    assert.equal(cellText(row?.[6]), "disabled: group \"blinds\" is off")
    assert.equal(cellText(row?.[4]), "none")
    assert.ok(host.sent.some(message => message.type === "panel.changed"), "the page is told")
  })

  test("Run now fires a schedule as a test; refused while off and for next-run sensors", async () => {
    h = new SchedulerHarness()
    const host = await h.start()
    const pulse = await host.addSensor("pulse", { trigger: "time", time: "06:30" }, "Wake up")
    const night = await host.addSensor("window", { trigger: "time", start: "22:00", end: "06:00" }, "Night")
    const next = await host.addSensor("next-run", { trigger: "time", time: "06:30" }, "Countdown")
    assert.equal(await host.action("run-now", { schedule: pulse }), "Ran \"Wake up\"")
    assert.deepEqual(host.values(pulse), [Value.boolean(false), Value.boolean(true)])
    assert.equal(await host.action("run-now", { schedule: night }), "Opened \"Night\" until Tue 2026-11-03 06:00")
    assert.deepEqual(host.values(night), [Value.boolean(false), Value.boolean(true)])
    await assert.rejects(host.action("run-now", { schedule: next }), /nothing to run/)
    await assert.rejects(host.action("run-now", { schedule: "gone" }), /isn't running any more/)
    await host.action("set-enabled", { group: "", enabled: false })
    await assert.rejects(host.action("run-now", { schedule: pulse }), /doesn't run while all schedules are off/)
    assert.notEqual(cellText(table(await host.panel())?.rows[2]?.[5]), "never", "the test run shows as the last run")
  })

  test("Skip from a row, and taking it back", async () => {
    h = new SchedulerHarness()
    const host = await h.start()
    const pulse = await host.addSensor("pulse", { trigger: "time", time: "06:30" }, "Wake up")
    assert.equal(await host.action("skip", { schedule: pulse, skip: true }), "\"Wake up\" skips its next run")
    assert.equal(await host.action("skip", { schedule: pulse, skip: true }), "\"Wake up\" already skips its next run")
    assert.equal(await host.action("skip", { schedule: pulse, skip: false }), "\"Wake up\" runs its next run after all")
    assert.equal(await host.action("skip", { schedule: pulse, skip: false }), "\"Wake up\" wasn't skipping a run")
  })

  test("Next runs lists 10 runs of a cron expression, a time or a schedule in the zone, DST included", async () => {
    h = new SchedulerHarness("2027-03-26T12:00:00Z")
    const host = await h.start()
    const lines = (await host.action("next-runs", { source: "cron", cron: "30 2 * * *" }))?.split("\n") ?? []
    assert.equal(lines[0], "Next runs of cron 30 2 * * * in Europe/Vienna:")
    assert.deepEqual(lines.slice(1, 5), ["Sat 2027-03-27 02:30", "Sun 2027-03-28 03:00", "Mon 2027-03-29 02:30", "Tue 2027-03-30 02:30"])
    assert.equal(lines.length, 11)
    const time = await host.action("next-runs", { source: "time", time: "07:15", weekdays: ["sat", "sun"] })
    assert.match(time ?? "", /^Next runs of 07:15 Sat, Sun in Europe\/Vienna:\nSat 2027-03-27 07:15\nSun 2027-03-28 07:15\nSat 2027-04-03 07:15/)
    const night = await host.addSensor("window", { trigger: "time", start: "22:00", end: "06:00" }, "Night")
    await host.action("skip", { schedule: night, skip: true })
    const windows = (await host.action("next-runs", { source: "schedule", schedule: night }))?.split("\n") ?? []
    assert.deepEqual(windows.slice(0, 3), [
      "Next runs of \"Night\" (22:00–06:00 daily) in Europe/Vienna:",
      "Fri 2027-03-26 22:00 (skipped) – Sat 2027-03-27 06:00", "Sat 2027-03-27 22:00 – Sun 2027-03-28 06:00"
    ])
    await assert.rejects(host.action("next-runs", { source: "cron", cron: "61 * * * *" }), /minute field has 61/)
  })

  test("the catalog offers each kind and the actuators for all schedules and each group; its entries are valid", async () => {
    h = new SchedulerHarness()
    const host = await h.start()
    await host.addSensor("pulse", { trigger: "time", time: "06:30", group: "blinds" })
    const catalog = await host.catalog()
    assert.deepEqual(catalog.map(node => [node.id, node.label]), [["examples", "New schedules"], ["all", "All schedules"], ["group:blinds", "Group \"blinds\""]])
    const kinds = new Set(catalog[0]?.entries?.map(entry => entry.capability))
    assert.deepEqual([...kinds].sort(), ["next-run", "pulse", "value-boolean", "value-number", "value-text", "window"])
    for (const entry of catalog.flatMap(node => node.entries ?? [])) {
      if (entry.kind === "sensor") await host.addSensor(entry.capability, entry.params, entry.label)
      else await host.addActuator(entry.capability, entry.params, entry.label)
    }
  })
})
