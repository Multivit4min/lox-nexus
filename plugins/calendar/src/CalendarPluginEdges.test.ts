import assert from "node:assert/strict"
import { after, afterEach, before, describe, test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { CalendarPlugin } from "./CalendarPlugin.ts"
import { FeedClient } from "./feed/FeedClient.ts"
import { CalendarHarness } from "./test-support/CalendarHarness.ts"

describe("CalendarPlugin edge cases", { timeout: 20_000 }, () => {
  let h: CalendarHarness
  before(async () => {
    h = await CalendarHarness.create()
    h.server.serve("/single.ics", "single.ics")
  })
  afterEach(() => h.cleanup())
  after(() => h.close())

  test("a feed over 8 MB is refused before it fills the worker's heap", async () => {
    h.server.text("/huge.ics", `BEGIN:VCALENDAR\r\nX-PAD:${"x".repeat(FeedClient.MAX_BYTES)}\r\nEND:VCALENDAR`, "text/calendar")
    const host = await h.started("/huge.ics")
    assert.match(host.status.message ?? "", /: the feed is larger than 8 MB$/)
  })

  test("a sensor that throws is logged; the read isn't a feed problem and the other sensors still update", async () => {
    const host = await h.started("/single.ics")
    const plugin = CalendarHarness.plugin(host)
    plugin.agenda.on("changed", () => {
      throw new Error("broken listener")
    })
    const active = await host.addSensor("active")
    await plugin.source.refresh()
    assert.equal(host.status.status, "running")
    h.advanceTo("2026-11-03T07:00:00Z")
    await plugin.source.refresh()
    assert.deepEqual(host.values(active).at(-1), Value.boolean(true))
    const errors = host.sent.flatMap(message => (message.type === "log" && message.level === "error" ? [message.data] : []))
    assert.deepEqual(errors[0], { error: "Error: broken listener" })
  })

  test("refuses a password without a username, and broken percent-encoding in the link", async () => {
    const start = (config: object) => PluginTestHost.start(CalendarPlugin, { config: { url: "https://example.com/c.ics", ...config } })
    await assert.rejects(start({ password: "secret" }), /a password needs a username/)
    await assert.rejects(start({ url: "https://a%zz:b@example.com/c.ics" }), /isn't valid URL encoding/)
    await (await start({ url: "https://a%40b:c@example.com/c.ics" })).stop()
  })
})
