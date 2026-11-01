import assert from "node:assert/strict"
import { afterEach, describe, test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { SchedulerPlugin } from "./SchedulerPlugin.ts"
import { SchedulerHarness } from "./test-support/SchedulerHarness.ts"

describe("settings checks", () => {
  let h: SchedulerHarness
  afterEach(() => h.cleanup())

  test("invalid schedules are refused when the signal is saved, with the reason", async () => {
    h = new SchedulerHarness()
    const host = await h.start()
    const refused: Array<[string, object, RegExp]> = [
      ["pulse", { trigger: "cron", cron: "61 * * * *" }, /minute field has 61; it must be 0 to 59/],
      ["pulse", { trigger: "cron", cron: "0 12 30 2 *" }, /never runs/],
      ["pulse", { trigger: "cron", cron: "  " }, /enter a cron expression/],
      ["value-number", { steps: [] }, /add at least one step/],
      ["value-number", { steps: [{ trigger: "time", time: "06:30", value: 1 }, { trigger: "time", time: "07:30", weekdays: [], value: 2 }] },
        /step 2: choose at least one weekday[\s\S]*steps\[1\]\.weekdays/],
      ["value-text", { steps: [{ trigger: "cron", cron: "61 * * * *", value: "x" }] }, /step 1: the minute field has 61; it must be 0 to 59/],
      ["value-text", { steps: [{ trigger: "cron", cron: "", value: "x" }] }, /step 1: enter a cron expression/],
      ["value-boolean", { steps: [{ trigger: "time", time: "7:00" }] }, /HH:MM[\s\S]*steps\[0\]\.time/],
      ["value-number", { steps: [{ trigger: "time", time: "07:00" }] }, /steps\[0\]\.value/],
      ["pulse", { trigger: "time", time: "6:30" }, /HH:MM/],
      ["pulse", { trigger: "time", time: "06:30", randomMinutes: 121 }, /randomMinutes/],
      ["pulse", { trigger: "time", time: "06:30", seconds: 0 }, /seconds/],
      ["pulse", { trigger: "time", time: "06:30", seconds: 3601 }, /seconds/],
      ["window", { trigger: "time", start: "22:00", end: "22:00" }, /opens and closes at the same time/],
      ["window", { trigger: "cron", startCron: "0 22 * * *", endCron: "0  22 * * * " }, /opens and closes at the same times/],
      ["window", { trigger: "cron", startCron: "0 22 * * *", endCron: "0 25 * * *" }, /hour field has 25/],
      ["window", { trigger: "time", start: "22:00", end: "22:30", randomMinutes: 15 }, /too short for its random offset/],
      ["window", { trigger: "time", start: "06:00", end: "05:40", randomMinutes: 10 }, /too short for its random offset/],
      ["next-run", { trigger: "weekly", time: "06:30" }, /trigger/]
    ]
    await host.addSensor("window", { trigger: "time", start: "22:00", end: "22:31", randomMinutes: 15 })
    for (const [capability, params, message] of refused) {
      await assert.rejects(host.addSensor(capability, params), message, JSON.stringify(params))
    }
  })

  test("the time zone: an unknown one is refused; empty means the installation's", async () => {
    const result = await PluginTestHost.checkConfig(SchedulerPlugin, { timeZone: "Mars/Olympus" })
    assert.deepEqual(result.issues.map(issue => [issue.path, issue.message]), [[["timeZone"], "unknown time zone; use an IANA name such as Europe/Vienna"]])
    assert.deepEqual((await PluginTestHost.checkConfig(SchedulerPlugin, {})).issues, [])
    assert.deepEqual((await PluginTestHost.checkConfig(SchedulerPlugin, { timeZone: "" })).issues, [], "an emptied field is the default")
    h = new SchedulerHarness()
    const host = await h.start({ timeZone: "America/New_York" })
    assert.equal(host.plugin.zone.id, "America/New_York")
    const other = await h.start({ timeZone: "America/New_York", config: { timeZone: "Asia/Tokyo" } })
    assert.equal(other.plugin.zone.id, "Asia/Tokyo")
    const emptied = await h.start({ timeZone: "America/New_York", config: { timeZone: " " } })
    assert.equal(emptied.plugin.zone.id, "America/New_York")
  })

  test("the form: a choice of trigger, weekdays as chips, the group marked as the signal's group", async () => {
    const description = await PluginTestHost.describe(SchedulerPlugin)
    const pulse = description.sensors.find(sensor => sensor.id === "pulse")
    const branches = (pulse?.params as { oneOf?: Array<{ properties: Record<string, Record<string, unknown>> }> }).oneOf ?? []
    assert.deepEqual(branches.map(branch => branch.properties.trigger?.const), ["time", "cron"])
    const time = branches[0]?.properties
    assert.equal(time?.time?.format, "time")
    assert.equal((time?.weekdays?.items as { enum?: string[] }).enum?.length, 7)
    assert.equal(time?.group?.signalGroup, true)
    assert.deepEqual(description.actuators.map(actuator => actuator.id), ["enabled", "skip-next"])
  })
})
