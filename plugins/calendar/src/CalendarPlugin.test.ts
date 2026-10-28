import assert from "node:assert/strict"
import { createServer, type AddressInfo } from "node:net"
import { after, afterEach, before, describe, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { CalendarPlugin } from "./CalendarPlugin.ts"
import { CalendarHarness } from "./test-support/CalendarHarness.ts"

/** a port nothing listens on */
const closedPort = async () => {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo
  await new Promise(resolve => server.close(resolve))
  return port
}

/** the panel as lines: the feed facts as "label = value", then the events as "when = title (dismissed)" */
const panelLines = async (host: PluginTestHost) => {
  const panel = await host.panel()
  assert.equal(panel?.type, "sections")
  if (panel?.type !== "sections") return []
  return panel.sections.flatMap(({ panel: part }) => part.type === "keyValue"
    ? part.items.map(item => `${item.label} = ${item.value}`)
    : part.type === "table" ? part.rows.map(([when, title, note]) => `${when} = ${title}${note ? ` (${note})` : ""}`) : [])
}

const SECRET_PATH = "/private/token-5f3a9c/basic.ics"

describe("CalendarPlugin", { timeout: 20_000 }, () => {
  let h: CalendarHarness
  before(async () => {
    h = await CalendarHarness.create()
    h.server.serve("/weekly.ics", "weekly.ics").serve(SECRET_PATH, "single.ics")
  })
  afterEach(() => h.cleanup())
  after(() => h.close())

  const requests = (path: string) => h.server.requests.filter(request => request.path === path).length

  test("reads once at start, then once per refresh interval (old bug: two reads at start)", async () => {
    h.server.serve("/count.ics", "weekly.ics")
    const host = await h.started("/count.ics", { config: { refreshMinutes: 15 } })
    const plugin = CalendarHarness.plugin(host)
    assert.equal(requests("/count.ics"), 1)
    // a read starts synchronously when the timer fires, so `reading` tells without waiting for I/O
    await h.advanceTo("2026-11-02T08:14:59Z")
    assert.equal(plugin.source.reading, false, "no second read before the interval")
    await h.advanceTo("2026-11-02T08:15:00Z")
    assert.equal(plugin.source.reading, true)
    await plugin.source.refresh()
    await h.advanceTo("2026-11-02T08:30:00Z")
    await plugin.source.refresh()
    assert.equal(requests("/count.ics"), 3)
  })

  test("a failed read keeps the last calendar, degrades with the host, and recovers", async () => {
    h.server.serve("/flaky.ics", "weekly.ics")
    const host = await h.started("/flaky.ics")
    const plugin = CalendarHarness.plugin(host)
    const active = await host.addSensor("active")
    h.server.fail("/flaky.ics", 500)
    await h.advanceTo("2026-11-02T08:15:00Z")
    await plugin.source.refresh()
    assert.equal(host.status.status, "degraded")
    assert.match(host.status.message ?? "", /^127\.0\.0\.1:\d+: HTTP 500; using the calendar read 2026-11-02T08:00:00\.000Z$/)
    await h.advanceTo("2026-11-02T17:00:00Z")
    assert.deepEqual(host.values(active).at(-1), Value.boolean(true), "the last calendar still drives the sensors")
    // a refresh joins a running read, so let the one the last timer started fail first
    await plugin.source.refresh()
    h.server.serve("/flaky.ics", "weekly.ics")
    await plugin.source.refresh()
    assert.deepEqual(host.status, { status: "running", message: undefined })
    const logs = host.sent.flatMap(message => (message.type === "log" ? [message.message] : []))
    assert.deepEqual(logs, ["can't read the calendar; keeping the last one read", "reading the calendar again"])
  })

  test("401 or 403 starts degraded and says to check the credentials or the link; nothing is sent", async () => {
    h.server.fail("/denied.ics", 401).fail("/forbidden.ics", 403)
    const host = await h.started("/denied.ics")
    const active = await host.addSensor("active")
    assert.equal(host.status.status, "degraded")
    assert.match(host.status.message ?? "", /HTTP 401, access denied: check the username and password, or whether the private link is still valid$/)
    assert.deepEqual(host.values(active), [])
    const forbidden = await h.started("/forbidden.ics")
    assert.match(forbidden.status.message ?? "", /HTTP 403, access denied/)
    // the old integration read a second time at start exactly when nothing had been read yet
    assert.deepEqual([requests("/denied.ics"), requests("/forbidden.ics")], [1, 1])
  })

  test("an unreachable feed, a missing one or one that isn't a calendar only degrades the start", async () => {
    h.server.text("/login.ics", "<!doctype html><title>Sign in</title>")
    const host = await h.started("/login.ics")
    assert.match(host.status.message ?? "", /: not an iCalendar feed \(starts with "<!doctype html>/)
    const missing = await h.started("/gone.ics")
    assert.match(missing.status.message ?? "", /HTTP 404, no calendar at this link/)
    const port = await closedPort()
    const closed = await h.started("/x.ics", { config: { url: `http://127.0.0.1:${port}/x.ics` } })
    assert.match(closed.status.message ?? "", new RegExp(`^127\\.0\\.0\\.1:${port}: unreachable \\(.*ECONNREFUSED`))
    assert.deepEqual([requests("/login.ics"), requests("/gone.ics")], [1, 1], "one read at start, also when it fails")
  })

  test("sends basic auth, moves credentials out of the URL, and never shows the link's path", async () => {
    const host = await h.started(SECRET_PATH, { config: { username: "anna", password: "pa:ss" } })
    assert.equal(h.server.requests.at(-1)?.authorization, `Basic ${Buffer.from("anna:pa:ss").toString("base64")}`)
    const inline = await h.started(SECRET_PATH, { config: { url: h.server.url(SECRET_PATH).replace("//", "//bob:s%40fe@") } })
    assert.equal(h.server.requests.at(-1)?.authorization, `Basic ${Buffer.from("bob:s@fe").toString("base64")}`)
    h.server.fail(SECRET_PATH, 401)
    await CalendarHarness.plugin(inline).source.refresh()
    for (const shown of [host, inline]) {
      assert.ok(!JSON.stringify(shown.sent).includes("token-5f3a9c"), "the path stays out of logs and status")
      assert.ok(!JSON.stringify(await shown.panel()).includes("token-5f3a9c"), "and out of the panel")
    }
    assert.ok(!JSON.stringify(inline.sent).includes("s%40fe"))
  })

  test("refuses an invalid config; marks the link and the password as secret", async () => {
    const config = (extra: object) => ({ url: "https://example.com/cal.ics", ...extra })
    await assert.rejects(PluginTestHost.start(CalendarPlugin, { config: config({ url: "ftp://example.com/cal.ics" }) }), /invalid config/)
    await assert.rejects(PluginTestHost.start(CalendarPlugin, { config: config({ timeZone: "Mars/Olympus" }) }), /unknown time zone/)
    await assert.rejects(PluginTestHost.start(CalendarPlugin, { config: config({ refreshMinutes: 0 }) }), /invalid config/)
    const description = await PluginTestHost.describe(CalendarPlugin)
    const properties = description.config.properties as Record<string, { writeOnly?: boolean }>
    assert.deepEqual(Object.keys(properties), ["url", "username", "password", "refreshMinutes", "timeout", "timeZone"])
    assert.deepEqual(Object.entries(properties).filter(([, field]) => field.writeOnly).map(([key]) => key), ["url", "password"])
    assert.deepEqual(description.sensors.map(sensor => [sensor.id, sensor.valueType]), [["active", "boolean"], ["title", "string"], ["time", "number"]])
    assert.deepEqual(description.actuators.map(actuator => [actuator.id, actuator.valueType]), [["dismiss", "boolean"]])
  })

  test("names every field and every choice for the form", async () => {
    type Field = { title?: string; description?: string; enum?: string[]; enumLabels?: Record<string, string> }
    const description = await PluginTestHost.describe(CalendarPlugin)
    const fieldsOf = (schema: unknown) => Object.values((schema as { properties: Record<string, Field> }).properties)
    const fields = [description.config, ...description.sensors.map(sensor => sensor.params)].flatMap(fieldsOf)
    assert.deepEqual(fields.filter(field => !field.title || !field.description), [], "each field has a title and a hint")
    for (const field of fields.filter(field => field.enum)) {
      assert.deepEqual(Object.keys(field.enumLabels ?? {}), field.enum, `${field.title}: every option has a name`)
    }
    const time = Object.fromEntries(fieldsOf(description.sensors[2]?.params).map(field => [field.title, field]))
    assert.deepEqual(Object.keys(time), [
      "Text to look for", "Look in", "Regular expression", "Minutes before the start", "Minutes after the end", "Time", "Send as"
    ])
    assert.equal(time["Send as"]?.enumLabels?.minutesUntil, "Minutes from now")
    assert.ok(fieldsOf(description.config).some(field => field.title === "Timeout (seconds)"))
  })

  test("accepts webcal:// links and reads them over https", async () => {
    const host = await h.started("/w.ics", { config: { url: h.server.url("/weekly.ics").replace("http:", "webcal:") } })
    // the fixture server speaks plain http, so the TLS handshake is what fails
    assert.match(host.status.message ?? "", /^127\.0\.0\.1:\d+: unreachable/)
    assert.equal(requests("/weekly.ics"), 0)
  })

  test("the catalog offers any event and each upcoming title", async () => {
    const host = await h.started("/weekly.ics")
    const [any, byTitle] = await host.catalog()
    assert.equal(any?.label, "Any event")
    assert.deepEqual(any?.entries?.map(entry => [entry.kind, entry.capability, entry.label]), [
      ["sensor", "active", "Event active"], ["sensor", "title", "Current event title"], ["sensor", "title", "Next event title"],
      ["sensor", "time", "Minutes until the next event"], ["sensor", "time", "Minutes until the current event ends"],
      ["actuator", "dismiss", "Dismiss the active events"]
    ])
    assert.deepEqual(byTitle?.children?.map(node => node.label), ["Training", "Club meeting", "Training (moved)"])
    assert.deepEqual(byTitle?.children?.[1]?.entries, [
      { kind: "sensor", capability: "active", params: { match: "Club meeting" }, label: "Club meeting active", value: Value.boolean(false) },
      {
        kind: "sensor", capability: "time", params: { match: "Club meeting", which: "nextStart" }, label: "Minutes until the next Club meeting",
        value: Value.number(3480), unit: "min"
      },
      { kind: "actuator", capability: "dismiss", params: { match: "Club meeting" }, label: "Dismiss Club meeting" }
    ])
    for (const entry of [...any?.entries ?? [], ...byTitle?.children?.flatMap(node => node.entries ?? []) ?? []]) {
      await (entry.kind === "sensor" ? host.addSensor(entry.capability, entry.params) : host.addActuator(entry.capability, entry.params))
    }
  })

  test("the panel shows how reading goes and the next occurrences in local time", async () => {
    h.server.serve("/all-day.ics", "all-day.ics")
    const host = await h.started("/weekly.ics", { now: "2026-11-02T17:30:00Z" })
    await host.actuate(await host.addActuator("dismiss"), Value.boolean(true))
    const items = await panelLines(host)
    assert.match(items[0] ?? "", /^Feed = 127\.0\.0\.1:\d+$/)
    assert.deepEqual(items.slice(1), [
      "Last successful read = 2026-11-02T17:30:00.000Z", "Upcoming events (400 days) = 5", "Dismissed = 1", "Time zone = Europe/Vienna",
      "2026-11-02 18:00 – 19:00 = Training (dismissed)", "2026-11-04 19:00 – 21:00 = Club meeting",
      "2026-11-17 20:00 – 21:30 = Training (moved)", "2026-11-23 18:00 – 19:00 = Training", "2026-11-30 18:00 – 19:00 = Training"
    ])
    const allDay = await h.started("/all-day.ics")
    assert.deepEqual((await panelLines(allDay)).slice(5, 7), ["2026-11-04, all day = Public holiday", "2026-11-06 – 2026-11-07, all day = Vacation"])
  })
})
