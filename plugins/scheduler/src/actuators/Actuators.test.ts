import assert from "node:assert/strict"
import { afterEach, describe, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { SchedulerHarness } from "../test-support/SchedulerHarness.ts"

const TRUE = Value.boolean(true)
const FALSE = Value.boolean(false)
const trues = (values: Value[]) => values.filter(value => value.type === "boolean" && value.value).length

describe("actuators", () => {
  let h: SchedulerHarness
  afterEach(() => h.cleanup())

  test("Enabled switches a group or all schedules; off sends nothing, a window false; kept across a restart", async () => {
    h = new SchedulerHarness("2026-11-02T22:00:00Z") // Monday 23:00
    let host = await h.start()
    const night = await host.addSensor("window", { trigger: "time", start: "22:00", end: "06:00", group: "night" })
    const pulse = await host.addSensor("pulse", { trigger: "time", time: "05:00" })
    const nightSwitch = await host.addActuator("enabled", { group: "night" })
    const allSwitch = await host.addActuator("enabled", {})
    await host.actuate(nightSwitch, FALSE)
    assert.deepEqual(host.values(night), [TRUE, FALSE])
    assert.deepEqual(host.store.disabled, ["night"])
    await h.advanceTo("2026-11-03T04:00:00Z")
    assert.equal(trues(host.values(pulse)), 1, "another group's schedule still runs")
    await host.actuate(allSwitch, FALSE)
    await h.advanceTo("2026-11-04T04:00:00Z")
    assert.equal(trues(host.values(pulse)), 1, "all off: the pulse didn't run")
    host = await h.restart(host)
    const again = await host.addSensor("window", { trigger: "time", start: "22:00", end: "06:00", group: "night" })
    await host.addSensor("pulse", { trigger: "time", time: "05:00" })
    await h.advanceTo("2026-11-04T22:00:00Z")
    assert.deepEqual(host.values(again), [FALSE], "still off after the restart")
    const allAgain = await host.addActuator("enabled", {})
    await host.actuate(allAgain, TRUE, undefined, true)
    assert.deepEqual(host.values(again), [FALSE], "a replayed true for all is applied, but the group stays off")
    const nightAgain = await host.addActuator("enabled", { group: "night" })
    await host.actuate(nightAgain, TRUE)
    assert.deepEqual(host.values(again), [FALSE, TRUE], "on again in the middle of its window")
    assert.equal(host.store.disabled, undefined)
  })

  test("Skip next skips one run, kept across a restart; replayed values and false are ignored", async () => {
    h = new SchedulerHarness()
    let host = await h.start()
    await host.addSensor("pulse", { trigger: "time", time: "06:00" })
    const skip = await host.addActuator("skip-next", {})
    await host.actuate(skip, TRUE, undefined, true)
    await host.actuate(skip, FALSE)
    assert.equal(host.store.skips, undefined, "replayed true and false do nothing")
    await host.actuate(skip, TRUE)
    await host.actuate(skip, TRUE)
    assert.deepEqual(host.store.skips, { "sensor-1": { raw: Date.parse("2026-11-03T05:00:00Z"), until: Date.parse("2026-11-03T05:05:00Z") } })
    host = await h.restart(host)
    const pulse = await host.addSensor("pulse", { trigger: "time", time: "06:00" })
    await h.advanceTo("2026-11-03T05:01:00Z")
    assert.deepEqual(host.values(pulse), [FALSE], "skipped")
    assert.match(JSON.stringify(host.sent), /skipped its run at Tue 2026-11-03 06:00/)
    await h.advanceTo("2026-11-04T05:00:00Z")
    assert.deepEqual(host.values(pulse), [FALSE, TRUE], "the day after runs")
  })

  test("Skip next on an open window closes it until its end; a closed one skips the next", async () => {
    h = new SchedulerHarness("2026-11-02T22:00:00Z") // Monday 23:00, inside 22:00–06:00
    const host = await h.start()
    const night = await host.addSensor("window", { trigger: "time", start: "22:00", end: "06:00", group: "night" })
    const skip = await host.addActuator("skip-next", { group: "night" })
    await host.actuate(skip, TRUE)
    assert.deepEqual(host.values(night), [TRUE, FALSE])
    await h.advanceTo("2026-11-03T21:00:00Z")
    assert.deepEqual(host.values(night), [TRUE, FALSE, TRUE], "the next night opens as usual")
    await h.advanceTo("2026-11-04T05:00:00Z")
    await host.actuate(skip, TRUE)
    await h.advanceTo("2026-11-05T05:00:00Z")
    assert.deepEqual(host.values(night).slice(3), [FALSE], "Wednesday night skipped")
    await h.advanceTo("2026-11-05T21:00:00Z")
    assert.deepEqual(host.values(night).at(-1), TRUE)
  })

  test("Skip next on a next-run sensor moves it to the run after", async () => {
    h = new SchedulerHarness()
    const host = await h.start()
    const next = await host.addSensor("next-run", { trigger: "time", time: "10:00", format: "unix" })
    await host.actuate(await host.addActuator("skip-next", {}), TRUE)
    assert.deepEqual(host.values(next), [Value.number(Date.parse("2026-11-02T09:00:00Z") / 1000), Value.number(Date.parse("2026-11-03T09:00:00Z") / 1000)])
  })
})
