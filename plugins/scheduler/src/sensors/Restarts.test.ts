import assert from "node:assert/strict"
import { afterEach, describe, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { SchedulerHarness } from "../test-support/SchedulerHarness.ts"

const PULSE = { trigger: "time", time: "06:00" } // 05:00Z in November
const TRUE = Value.boolean(true)
const FALSE = Value.boolean(false)

const logs = (host: Awaited<ReturnType<SchedulerHarness["start"]>>, level: string) =>
  host.sent.flatMap(message => message.type === "log" && message.level === level ? [message.message] : [])

describe("missed runs and restarts", () => {
  let h: SchedulerHarness
  afterEach(() => h.cleanup())

  /** runs a host with one pulse from Sunday to just before Monday's run, then stops it */
  const before = async (stopAt: string) => {
    h = new SchedulerHarness("2026-11-01T12:00:00Z")
    const host = await h.start()
    await host.addSensor("pulse", PULSE)
    await h.advanceTo(stopAt)
    await h.stop(host)
    return structuredClone(host.store)
  }

  test("a run missed by at most 5 minutes runs once at start", async () => {
    const store = await before("2026-11-02T04:50:00Z")
    await h.advanceTo("2026-11-02T05:03:00Z")
    const host = await h.start({ store })
    const pulse = await host.addSensor("pulse", PULSE)
    assert.deepEqual(host.values(pulse), [FALSE, TRUE])
    await h.advanceTo("2026-11-02T05:03:01Z")
    assert.deepEqual(host.values(pulse), [FALSE, TRUE, FALSE])
    await h.advanceTo("2026-11-03T04:59:00Z")
    assert.equal(host.values(pulse).length, 3, "nothing more until the next day")
  })

  test("an older one is skipped and logged", async () => {
    const store = await before("2026-11-02T04:50:00Z")
    await h.advanceTo("2026-11-02T05:05:01Z")
    const host = await h.start({ store })
    const pulse = await host.addSensor("pulse", PULSE)
    assert.deepEqual(host.values(pulse), [FALSE])
    assert.match(logs(host, "info").join("\n"), /missed its run at Mon 2026-11-02 06:00 while stopped/)
  })

  test("a run that happened before the restart isn't run again", async () => {
    const store = await before("2026-11-02T05:00:30Z")
    await h.advanceTo("2026-11-02T05:02:00Z")
    const host = await h.start({ store })
    const pulse = await host.addSensor("pulse", PULSE)
    assert.deepEqual(host.values(pulse), [FALSE])
  })

  test("a schedule just added doesn't run for a time already past", async () => {
    h = new SchedulerHarness("2026-11-02T05:02:00Z")
    const host = await h.start()
    const pulse = await host.addSensor("pulse", PULSE)
    assert.deepEqual(host.values(pulse), [FALSE])
  })

  test("a pulse never comes back as true: stopped in the middle, it starts with false", async () => {
    h = new SchedulerHarness("2026-11-02T04:59:00Z")
    let host = await h.start()
    let pulse = await host.addSensor("pulse", { ...PULSE, seconds: 60 })
    await h.advanceTo("2026-11-02T05:00:10Z")
    assert.deepEqual(host.values(pulse).at(-1), TRUE, "stopped while the pulse is on: the bus keeps true")
    host = await h.restart(host)
    pulse = await host.addSensor("pulse", { ...PULSE, seconds: 60 })
    assert.deepEqual(host.values(pulse), [FALSE], "false at once, and the run isn't repeated")
    await h.advanceTo("2026-11-02T05:02:00Z")
    assert.deepEqual(host.values(pulse), [FALSE])
  })

  test("the wall clock jumping past a run: run within the grace, logged as missed beyond it", async () => {
    h = new SchedulerHarness("2026-11-02T04:58:00Z")
    const host = await h.start()
    const pulse = await host.addSensor("pulse", PULSE)
    const late = await host.addSensor("pulse", { trigger: "time", time: "07:00" })
    // NTP moves the clock 3 minutes ahead; pending timers keep their remaining delay
    h.clock.jump(3 * 60_000)
    await h.clock.advance(60_000)
    assert.deepEqual(host.values(pulse), [FALSE, TRUE], "06:00 passed 2 minutes ago, noticed within a minute")
    h.clock.jump(Date.parse("2026-11-02T06:10:00Z") - h.clock.now())
    await h.clock.advance(60_000)
    assert.deepEqual(host.values(late), [FALSE])
    assert.match(logs(host, "warn").join("\n"), /missed its run at Mon 2026-11-02 07:00: the clock jumped past it/)
  })

  test("a run years away waits in steps of at most a minute, never on one long timer", async () => {
    h = new SchedulerHarness()
    const host = await h.start()
    const leap = await host.addSensor("next-run", { trigger: "cron", cron: "0 12 29 2 *", format: "unix" })
    assert.deepEqual(host.values(leap), [Value.number(Date.parse("2028-02-29T11:00:00Z") / 1000)])
    assert.equal(h.clock.pending, 2, "the sensor's minute timer and the plugin's hourly prune")
    await h.clock.advance(61_000)
    assert.equal(h.clock.pending, 2)
  })
})
