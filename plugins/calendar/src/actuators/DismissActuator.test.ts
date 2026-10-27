import assert from "node:assert/strict"
import { after, afterEach, before, describe, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { CalendarHarness } from "../test-support/CalendarHarness.ts"

// weekly.ics: "Training" Mondays 17:00–18:00 UTC from 2026-11-02 (11-09 excluded, 11-16 moved to 11-17 19:00)
const FIRST = "training@lox-nexus.test@2026-11-02T17:00:00.000Z"
const DAY = 24 * 3_600_000

describe("dismiss", { timeout: 20_000 }, () => {
  let h: CalendarHarness
  before(async () => {
    h = await CalendarHarness.create()
    h.server.serve("/weekly.ics", "weekly.ics").serve("/single.ics", "single.ics")
  })
  afterEach(() => h.cleanup())
  after(() => h.close())

  test("hides only the active occurrence of a series from every sensor, not the whole series (old bug)", async () => {
    const host = await h.started("/weekly.ics", { now: "2026-11-02T17:30:00Z" })
    const active = await host.addSensor("active", { match: "training" })
    const title = await host.addSensor("title")
    const dismiss = await host.addActuator("dismiss", { match: "training" })
    assert.deepEqual([host.values(active), host.values(title)], [[Value.boolean(true)], [Value.string("Training")]])
    await host.actuate(dismiss, Value.boolean(true))
    assert.deepEqual([host.values(active).at(-1), host.values(title).at(-1)], [Value.boolean(false), Value.string("")])
    assert.deepEqual(host.store.dismissed, { [FIRST]: Date.parse("2026-11-02T18:00:00Z") + DAY })
    h.advanceTo("2026-11-17T19:00:00Z", 3_600_000)
    assert.deepEqual(host.values(active).at(-1), Value.boolean(true), "the moved occurrence two weeks later shows")
    assert.deepEqual(host.values(title).at(-1), Value.string("Training (moved)"))
  })

  test("false, or nothing active, dismisses nothing", async () => {
    const host = await h.started("/weekly.ics", { now: "2026-11-02T17:30:00Z" })
    const active = await host.addSensor("active")
    await host.actuate(await host.addActuator("dismiss"), Value.boolean(false))
    await host.actuate(await host.addActuator("dismiss", { match: "meeting" }), Value.boolean(true))
    assert.deepEqual(host.values(active), [Value.boolean(true)])
    assert.equal(host.store.dismissed, undefined)
  })

  test("hides what a sensor shows in its lead time: bins tomorrow, dismissed tonight with the catalog's entry", async () => {
    // single.ics: "Waste collection" 2026-11-03 07:00–08:00 UTC
    const host = await h.started("/single.ics", { now: "2026-11-02T20:00:00Z" })
    const tonight = await host.addSensor("active", { match: "waste", leadMinutes: 720 })
    const dismiss = await host.addActuator("dismiss", { match: "Waste collection" })
    assert.deepEqual(host.values(tonight), [Value.boolean(true)])
    await host.actuate(dismiss, Value.boolean(true))
    assert.deepEqual(host.values(tonight), [Value.boolean(true), Value.boolean(false)])
    h.advanceTo("2026-11-03T07:30:00Z")
    assert.deepEqual(host.values(tonight).at(-1), Value.boolean(false), "stays hidden through the event")
  })

  test("doesn't hide what no sensor shows, even when a sensor names it as the next event", async () => {
    const host = await h.started("/single.ics", { now: "2026-11-02T08:00:00Z" })
    const next = await host.addSensor("title", { which: "next" })
    await host.addSensor("active", { leadMinutes: 60 })
    await host.actuate(await host.addActuator("dismiss"), Value.boolean(true))
    assert.equal(host.store.dismissed, undefined)
    assert.deepEqual(host.values(next), [Value.string("Waste collection")])
  })

  test("works in the lead time, before the event starts", async () => {
    const host = await h.started("/weekly.ics", { now: "2026-11-02T16:30:00Z" })
    const active = await host.addSensor("active", { leadMinutes: 60 })
    await host.actuate(await host.addActuator("dismiss", { leadMinutes: 60 }), Value.boolean(true))
    assert.deepEqual(host.values(active), [Value.boolean(true), Value.boolean(false)])
    h.advanceTo("2026-11-02T17:00:00Z")
    assert.deepEqual(host.values(active).at(-1), Value.boolean(false), "the start doesn't bring it back")
  })

  test("a dismissal is forgotten a day after its occurrence ended, so the store doesn't grow (old bug)", async () => {
    const host = await h.started("/weekly.ics", { now: "2026-11-02T17:30:00Z" })
    const plugin = CalendarHarness.plugin(host)
    await host.actuate(await host.addActuator("dismiss"), Value.boolean(true))
    h.advanceTo("2026-11-03T17:45:00Z", 3_600_000)
    await plugin.source.refresh()
    assert.deepEqual(Object.keys(host.store.dismissed as object), [FIRST], "kept while a lag could still show it")
    h.advanceTo("2026-11-03T18:00:00Z")
    await plugin.source.refresh()
    assert.equal(host.store.dismissed, undefined, "pruned at the next read")
  })

  test("dismissals survive a restart; an unreadable stored value is ignored", async () => {
    const until = Date.parse("2026-11-03T18:00:00Z")
    const host = await h.started("/weekly.ics", { now: "2026-11-02T17:30:00Z", store: { dismissed: { [FIRST]: until } } })
    const active = await host.addSensor("active")
    assert.deepEqual(host.values(active), [Value.boolean(false)])
    const broken = await h.started("/weekly.ics", { store: { dismissed: ["not", "a", "record"] } })
    assert.deepEqual(broken.values(await broken.addSensor("active")), [Value.boolean(true)])
  })
})
