import assert from "node:assert/strict"
import { after, afterEach, before, describe, test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { CalendarPlugin } from "./CalendarPlugin.ts"
import { IcsServer } from "./test-support/IcsServer.ts"
import { newResources, waitFor } from "./test-support/waitFor.ts"

// real timers on purpose: faked ones don't show up as active resources
describe("CalendarPlugin lifecycle", { timeout: 20_000 }, () => {
  let server: IcsServer
  // whatever a failed assertion leaves running is stopped here, so `npm test` can't hang on it
  const hosts: PluginTestHost[] = []
  let release = () => {}
  before(async () => (server = await IcsServer.start()))
  afterEach(async () => {
    release()
    await Promise.allSettled(hosts.splice(0).map(host => host.stop()))
  })
  after(() => server.close())

  const start = async (path: string) => {
    const host = await PluginTestHost.start(CalendarPlugin, { config: { url: server.url(path), refreshMinutes: 1 } })
    hosts.push(host)
    return host
  }

  test("stopping leaves no timers, sockets or requests behind, also mid-read", async () => {
    // an occurrence a few days from now, so sensors have timers pending when they stop
    const soon = new Date(Date.now() + 3 * 24 * 3_600_000).toISOString().replace(/[-:]|\.\d+/g, "")
    server.text("/soon.ics", IcsServer.fixture("single.ics").replace(/DTSTART:\w+/, `DTSTART:${soon}`).replace(/DTEND:\w+\r?\n/, ""), "text/calendar")
    const baseline = process.getActiveResourcesInfo()
    for (let cycle = 0; cycle < 2; cycle++) {
      const host = await start("/soon.ics")
      const active = await host.addSensor("active", { lagMinutes: 5 })
      await host.addSensor("time", { which: "nextStart" })
      await waitFor(() => host.values(active).length > 0, "the sensor got the calendar")
      await host.stop()
    }
    release = server.hold()
    const hanging = await start("/soon.ics")
    await waitFor(() => server.requests.length === 3, "the read is in flight")
    await hanging.stop()
    release()
    await waitFor(() => newResources(baseline).length === 0, `left behind: ${newResources(baseline).join(", ")}`)
    assert.equal(hanging.status.status, "running", "an aborted read isn't reported as a problem")
  })
})
