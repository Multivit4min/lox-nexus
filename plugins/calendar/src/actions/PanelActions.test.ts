import assert from "node:assert/strict"
import { after, afterEach, before, describe, test } from "node:test"
import type { Panel } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { CalendarHarness } from "../test-support/CalendarHarness.ts"

// weekly.ics: "Training" Mondays 17:00–18:00 UTC from 2026-11-02
const FIRST = "training@lox-nexus.test@2026-11-02T17:00:00.000Z"

/** the buttons of the events table, one row each */
const rowButtons = (panel: Panel | undefined) => {
  if (panel?.type !== "sections") return []
  const table = panel.sections[1]?.panel
  return table?.type === "table" ? (table.rowActions ?? []).map(row => row.map(({ action, input }) => [action, (input as { event: string }).event])) : []
}

describe("panel actions", { timeout: 20_000 }, () => {
  let h: CalendarHarness
  before(async () => {
    h = await CalendarHarness.create()
    h.server.serve("/weekly.ics", "weekly.ics")
  })
  afterEach(() => h.cleanup())
  after(() => h.close())

  test("a row's Dismiss hides that occurrence from the sensors, and its Restore brings it back", async () => {
    const host = await h.started("/weekly.ics", { now: "2026-11-02T17:30:00Z" })
    const active = await host.addSensor("active")
    assert.deepEqual(rowButtons(await host.panel())[0], [["dismiss-event", FIRST]])
    assert.equal(await host.action("dismiss-event", { event: FIRST }), "Dismissed Training")
    assert.deepEqual(host.values(active).at(-1), Value.boolean(false))
    assert.deepEqual(rowButtons(await host.panel())[0], [["restore-event", FIRST]], "the row now offers Restore")
    assert.equal(await host.action("dismiss-event", { event: FIRST }), "Training was already dismissed")
    assert.equal(await host.action("restore-event", { event: FIRST }), "Restored Training")
    assert.deepEqual(host.values(active).at(-1), Value.boolean(true))
    assert.equal(host.store.dismissed, undefined)
    await assert.rejects(host.action("restore-event", { event: FIRST }), /isn't dismissed/)
    await assert.rejects(host.action("dismiss-event", { event: "gone@x@2020-01-01T00:00:00.000Z" }), /isn't in the calendar/)
  })

  test("Read now reads the feed at once and says how it went", async () => {
    const host = await h.started("/weekly.ics", { now: "2026-11-02T10:00:00Z" })
    assert.match(await host.action("read-now") ?? "", /^Read \d+ occurrences$/)
    h.server.fail("/weekly.ics", 500)
    await assert.rejects(host.action("read-now"), /500/)
  })
})
