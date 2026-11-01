import assert from "node:assert/strict"
import { afterEach, describe, test } from "node:test"
import { cellText, PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { SchedulerPlugin } from "./SchedulerPlugin.ts"
import { SchedulerHarness } from "./test-support/SchedulerHarness.ts"

describe("lifecycle", () => {
  let h: SchedulerHarness
  afterEach(() => h.cleanup())

  const addAll = async (host: Awaited<ReturnType<SchedulerHarness["start"]>>) => {
    await host.addSensor("pulse", { trigger: "time", time: "09:01", seconds: 600 })
    await host.addSensor("window", { trigger: "time", start: "22:00", end: "06:00", randomMinutes: 30 })
    await host.addSensor("value-number", { steps: [{ trigger: "cron", cron: "*/5 * * * *", value: 1 }, { trigger: "time", time: "09:03", value: 2 }] })
    await host.addSensor("next-run", { trigger: "cron", cron: "0 12 29 2 *" })
    await host.addActuator("enabled", {})
  }

  test("stopping leaves no timers behind, also in the middle of a pulse", async () => {
    h = new SchedulerHarness()
    for (let cycle = 0; cycle < 2; cycle++) {
      const host = await h.start()
      await addAll(host)
      await h.clock.advance(90_000) // the pulse at 09:01 is on for 10 minutes
      assert.ok(h.clock.pending > 0)
      await h.stop(host)
      assert.equal(h.clock.pending, 0, `cycle ${cycle}`)
    }
  })

  test("removing a schedule removes its timers and its row", async () => {
    h = new SchedulerHarness()
    const host = await h.start()
    const base = h.clock.pending
    const pulse = await host.addSensor("pulse", { trigger: "time", time: "09:01" })
    assert.equal(h.clock.pending, base + 1)
    await host.remove(pulse)
    assert.equal(h.clock.pending, base)
    const panel = await host.panel()
    assert.equal(panel?.type === "sections" ? panel.sections[1]?.panel.type : undefined, "notice")
  })

  test("an older Nexus gets a plain panel and no push messages", async () => {
    h = new SchedulerHarness()
    const host = await PluginTestHost.start(SchedulerPlugin, { clock: h.clock, timeZone: "Europe/Vienna", hostFeatures: [] })
    try {
      await host.addSensor("pulse", { trigger: "time", time: "10:00" }, "Ten")
      await host.actuate(await host.addActuator("enabled", {}), Value.boolean(false))
      const panel = await host.panel()
      const part = panel?.type === "sections" ? panel.sections[1]?.panel : undefined
      assert.equal(part?.type === "table" ? typeof part.rows[0]?.[6] : undefined, "string")
      assert.equal(part?.type === "table" ? cellText(part.rows[0]?.[6]) : undefined, "disabled: all schedules are off")
      assert.ok(!host.sent.some(message => message.type === "panel.changed"))
    } finally {
      await host.stop()
    }
  })
})
