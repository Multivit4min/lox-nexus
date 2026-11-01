import assert from "node:assert/strict"
import { afterEach, describe, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { SchedulerHarness } from "../test-support/SchedulerHarness.ts"

const TRUE = Value.boolean(true)
const FALSE = Value.boolean(false)
const PULSE = { trigger: "time", time: "06:00", group: "morning" } // 05:00Z in November

type Host = Awaited<ReturnType<SchedulerHarness["start"]>>
const logs = (host: Host, level: string) => host.sent.flatMap(message => message.type === "log" && message.level === level ? [message.message] : []).join("\n")

describe("grace, clock steps and many schedules", () => {
  let h: SchedulerHarness
  afterEach(() => h.cleanup())

  test("a run that was off at its time doesn't run late after a restart", async () => {
    h = new SchedulerHarness("2026-11-02T04:58:00Z")
    let host = await h.start()
    await host.addSensor("pulse", PULSE)
    const morning = await host.addActuator("enabled", { group: "morning" })
    await host.actuate(morning, FALSE)
    await h.advanceTo("2026-11-02T05:00:30Z")
    await host.actuate(morning, TRUE)
    await h.advanceTo("2026-11-02T05:02:00Z")
    host = await h.restart(host)
    const pulse = await host.addSensor("pulse", PULSE)
    assert.deepEqual(host.values(pulse), [FALSE])
  })

  test("a run that passed before an edit doesn't run at once (an edit stops the sensor and starts one with the same id)", async () => {
    h = new SchedulerHarness("2026-11-02T04:30:00Z")
    let host = await h.start()
    await host.addSensor("pulse", { trigger: "time", time: "07:00" })
    await h.advanceTo("2026-11-02T05:02:00Z")
    host = await h.restart(host)
    const edited = await host.addSensor("pulse", PULSE)
    assert.deepEqual(host.values(edited), [FALSE], "06:00 passed while the old schedule ran")
    await h.advanceTo("2026-11-03T05:00:00Z")
    assert.deepEqual(host.values(edited), [FALSE, TRUE], "the next day it runs")
  })

  test("a step back of the clock: a small one repeats nothing, a large one starts over from the new time", async () => {
    h = new SchedulerHarness("2026-11-02T04:59:00Z")
    const host = await h.start()
    const pulse = await host.addSensor("pulse", PULSE)
    await h.advanceTo("2026-11-02T05:00:30Z")
    assert.deepEqual(host.values(pulse), [FALSE, TRUE, FALSE])
    h.clock.jump(-2 * 60_000)
    await h.clock.advance(5 * 60_000)
    assert.equal(host.values(pulse).length, 3, "the run isn't repeated after a 2-minute step back")
    h.clock.jump(-60 * 60_000) // from 05:03:30Z to 04:03:30Z
    await h.clock.advance(60_000)
    assert.match(logs(host, "warn"), /the clock went back to Mon 2026-11-02 05:04/)
    await h.advanceTo("2026-11-02T05:00:00Z")
    assert.deepEqual(host.values(pulse).at(-1), TRUE, "not silent until the old time comes round: 06:00 runs again")
  })

  test("a persisted time after now (the clock was set back while stopped) is ignored", async () => {
    h = new SchedulerHarness("2026-11-02T04:58:00Z")
    const store = { "run:sensor-1": { seen: Date.parse("2026-11-03T00:00:00Z"), handled: Date.parse("2026-11-03T00:00:00Z") } }
    const host = await h.start({ store })
    const pulse = await host.addSensor("pulse", PULSE)
    assert.match(logs(host, "warn"), /last ran after the current time/)
    await h.advanceTo("2026-11-02T05:00:00Z")
    assert.deepEqual(host.values(pulse), [FALSE, TRUE])
  })

  test("records are pruned by their latest time, not by when the sensor last started", async () => {
    h = new SchedulerHarness()
    const now = Date.parse(SchedulerHarness.NOW)
    const old = now - 500 * 86_400_000
    const host = await h.start({ store: { "run:gone": { seen: old }, "run:window": { seen: old, ran: now - 86_400_000 }, "run:broken": 3 } })
    assert.deepEqual(Object.keys(host.store).filter(key => key.startsWith("run:")), ["run:window"])
  })

  test("more than 10 schedules: no listener warning; removing them removes their listeners", async () => {
    h = new SchedulerHarness()
    const warnings: string[] = []
    const onWarning = (warning: Error) => warnings.push(warning.name)
    process.on("warning", onWarning)
    try {
      const host = await h.start()
      const ids: string[] = []
      for (let index = 0; index < 15; index++) ids.push(await host.addSensor("pulse", { trigger: "time", time: `0${index % 10}:00` }))
      await new Promise(resolve => setImmediate(resolve))
      assert.equal(host.plugin.changes.listenerCount("changed"), 15)
      for (const id of ids) await host.remove(id)
      assert.equal(host.plugin.changes.listenerCount("changed"), 0)
      assert.deepEqual(warnings, [])
    } finally {
      process.off("warning", onWarning)
    }
  })

  test("Skip next on a group tells the schedules once, not once per schedule", async () => {
    h = new SchedulerHarness()
    const host = await h.start()
    for (const time of ["06:00", "07:00", "08:00"]) await host.addSensor("pulse", { trigger: "time", time, group: "morning" })
    let told = 0
    host.plugin.changes.on("changed", () => told++)
    await host.actuate(await host.addActuator("skip-next", { group: "morning" }), TRUE)
    assert.equal(told, 1)
    assert.equal(Object.keys(host.store.skips as object).length, 3)
  })
})

describe("window: Run now, skips and clock steps", () => {
  let h: SchedulerHarness
  afterEach(() => h.cleanup())
  const NIGHT = { trigger: "time", start: "22:00", end: "06:00" }

  test("skip, Run now, Skip next inside a skipped window: closed at once with a sensible answer", async () => {
    h = new SchedulerHarness("2026-11-02T22:00:00Z") // Monday 23:00
    const host = await h.start()
    const night = await host.addSensor("window", NIGHT, "Night")
    assert.equal(await host.action("skip", { schedule: night, skip: true }), "\"Night\" skips its next run")
    await host.action("run-now", { schedule: night })
    assert.deepEqual(host.values(night), [TRUE, FALSE, TRUE])
    assert.equal(await host.action("skip", { schedule: night, skip: true }), "\"Night\" skips its next run")
    assert.deepEqual(host.values(night), [TRUE, FALSE, TRUE, FALSE], "false at once, not at the next minute")
    await host.actuate(await host.addActuator("skip-next", {}), TRUE)
    assert.equal(host.values(night).length, 4)
  })

  test("the next off time of a window opened by Run now is its own when the regular window is off by then (after an edit)", async () => {
    h = new SchedulerHarness() // Monday 09:00, the window is closed
    let host = await h.start()
    await host.addSensor("window", NIGHT, "Night")
    await host.action("run-now", { schedule: "sensor-1" }) // open until Tuesday 06:00 (05:00Z)
    // an edit to 10:00–12:00: the stored open-until time is no end of the new window
    host = await h.restart(host)
    const edited = await host.addSensor("window", { trigger: "time", start: "10:00", end: "12:00" }, "Night")
    assert.deepEqual(host.plugin.schedules.get(edited)?.next(h.clock.now()), { at: Date.parse("2026-11-03T05:00:00Z"), turns: "off" })
    await h.advanceTo("2026-11-03T05:00:00Z")
    assert.deepEqual(host.values(edited), [TRUE, FALSE])
    // an edit to 22:00–07:00 instead: regularly on at that time, so off at the regular end
    host = await h.restart(host)
    await host.action("run-now", { schedule: (await host.addSensor("window", NIGHT, "Night")) })
    host = await h.restart(host)
    const later = await host.addSensor("window", { trigger: "time", start: "22:00", end: "07:00" }, "Night")
    assert.deepEqual(host.plugin.schedules.get(later)?.next(h.clock.now()), { at: Date.parse("2026-11-04T06:00:00Z"), turns: "off" })
  })

  test("a large clock step back closes a window opened by Run now", async () => {
    h = new SchedulerHarness() // Monday 09:00
    const host = await h.start()
    const night = await host.addSensor("window", NIGHT)
    await host.action("run-now", { schedule: night })
    h.clock.jump(-3 * 3_600_000)
    await h.clock.advance(60_000)
    assert.deepEqual(host.values(night), [FALSE, TRUE, FALSE])
    assert.match(logs(host, "warn"), /the clock went back to Mon 2026-11-02 06:01/)
    assert.equal((host.store["run:sensor-1"] as { openUntil?: number }).openUntil, undefined)
  })
})
