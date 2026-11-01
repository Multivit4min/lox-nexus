import assert from "node:assert/strict"
import { afterEach, describe, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { SchedulerHarness } from "../test-support/SchedulerHarness.ts"
import { TimeFormat } from "../time/TimeFormat.ts"

const daily = (time: string, extra: object = {}) => ({ trigger: "time", time, ...extra })
const t = (iso: string) => Date.parse(iso)

describe("schedule sensors", () => {
  let h: SchedulerHarness
  afterEach(() => h.cleanup())

  test("pulse: false at start, true at each run in the zone, false after its length", async () => {
    h = new SchedulerHarness()
    const host = await h.start()
    const pulse = await host.addSensor("pulse", daily("06:30", { weekdays: ["mon", "tue", "wed", "thu", "fri"], seconds: 5 }))
    assert.deepEqual(host.values(pulse), [Value.boolean(false)])
    await h.advanceTo("2026-11-03T05:30:00Z") // Tuesday 06:30 in Vienna
    assert.deepEqual(host.values(pulse), [Value.boolean(false), Value.boolean(true)])
    await h.advanceTo("2026-11-03T05:30:04.999Z")
    assert.equal(host.values(pulse).length, 2)
    await h.advanceTo("2026-11-03T05:30:05Z")
    assert.deepEqual(host.values(pulse).at(-1), Value.boolean(false))
    // Friday, then Monday: the weekend is left out
    await h.advanceTo("2026-11-09T05:30:10Z")
    assert.equal(host.values(pulse).filter(value => value.type === "boolean" && value.value).length, 5)
  })

  test("window: on from the start until the end, across midnight; right at start inside it", async () => {
    h = new SchedulerHarness("2026-11-02T22:00:00Z") // Monday 23:00 in Vienna
    const host = await h.start()
    const night = await host.addSensor("window", { trigger: "time", start: "22:00", end: "06:00", weekdays: ["fri"] })
    const all = await host.addSensor("window", { trigger: "time", start: "22:00", end: "06:00" })
    assert.deepEqual(host.values(all), [Value.boolean(true)], "worked out from the clock")
    assert.deepEqual(host.values(night), [Value.boolean(false)], "only Friday nights")
    await h.advanceTo("2026-11-03T05:00:00Z")
    assert.deepEqual(host.values(all).at(-1), Value.boolean(false), "off at 06:00")
    await h.advanceTo("2026-11-06T21:00:00Z") // Friday 22:00
    assert.deepEqual([host.values(all).at(-1), host.values(night).at(-1)], [Value.boolean(true), Value.boolean(true)])
    await h.advanceTo("2026-11-07T04:59:59Z")
    assert.deepEqual(host.values(night).at(-1), Value.boolean(true), "Friday's window runs into Saturday")
    await h.advanceTo("2026-11-07T05:00:00Z")
    assert.deepEqual(host.values(night), [Value.boolean(false), Value.boolean(true), Value.boolean(false)])
    await h.advanceTo("2026-11-07T21:00:00Z")
    assert.deepEqual(host.values(night).at(-1), Value.boolean(false), "not on Saturday")
  })

  test("window with cron expressions", async () => {
    h = new SchedulerHarness()
    const host = await h.start()
    const work = await host.addSensor("window", { trigger: "cron", startCron: "0 8 * * MON-FRI", endCron: "30 17 * * *" })
    assert.deepEqual(host.values(work), [Value.boolean(true)], "Monday 09:00")
    await h.advanceTo("2026-11-02T16:30:00Z")
    assert.deepEqual(host.values(work).at(-1), Value.boolean(false))
  })

  test("next run: minutes counting down, Unix time, Loxone date; none while switched off", async () => {
    h = new SchedulerHarness("2026-11-02T08:57:30Z")
    const host = await h.start()
    const ten = { trigger: "time", time: "10:00" } // 09:00Z
    const minutes = await host.addSensor("next-run", ten)
    const unix = await host.addSensor("next-run", { ...ten, format: "unix" })
    const loxone = await host.addSensor("next-run", { ...ten, format: "loxone" })
    assert.deepEqual(host.values(minutes), [Value.number(3)], "2.5 minutes round up")
    assert.deepEqual(host.values(unix), [Value.number(t("2026-11-02T09:00:00Z") / 1000)])
    // Loxone counts local seconds since 2009-01-01 00:00
    assert.deepEqual(host.values(loxone), [Value.number((Date.UTC(2026, 10, 2, 10) - Date.UTC(2009, 0, 1)) / 1000)])
    await h.advanceTo("2026-11-02T09:00:00Z")
    assert.deepEqual(host.values(minutes).slice(1), [Value.number(2), Value.number(1), Value.number(1440)], "then the next day")
    await host.addActuator("enabled", {}).then(id => host.actuate(id, Value.boolean(false)))
    assert.deepEqual([host.values(minutes).at(-1), host.values(unix).at(-1)], [Value.number(TimeFormat.NONE_MINUTES), Value.number(0)])
  })

  test("random offset: within ± the minutes, drawn per run and per schedule, the same after a restart", async () => {
    h = new SchedulerHarness()
    const params = { trigger: "time", time: "12:00", randomMinutes: 30 }
    type Host = Awaited<ReturnType<SchedulerHarness["start"]>>
    const planned = (host: Host, id: string) => host.plugin.schedules.get(id)?.next(h.clock.now())?.at ?? 0
    // a fixed seed, so the draws (and that two schedules differ) are the same in every run of the test
    let host = await h.start({ store: { seed: "fedcba9876543210fedcba9876543210" } })
    let pulse = await host.addSensor("pulse", params)
    const next = await host.addSensor("next-run", { ...params, format: "unix" })
    const first = planned(host, pulse)
    assert.ok(Math.abs(first - t("2026-11-02T11:00:00Z")) <= 30 * 60_000, new Date(first).toISOString())
    assert.equal((host.values(next)[0] as { value: number }).value * 1000, t("2026-11-02T11:00:00Z"), "next run has no offset of its own")
    const sibling = await host.addSensor("pulse", params)
    assert.notEqual(planned(host, sibling), first, "two schedules draw on their own")
    host = await h.restart(host)
    pulse = await host.addSensor("pulse", params)
    await host.addSensor("next-run", params)
    assert.equal(planned(host, pulse), first, "the same signal keeps its draw for the same run")
    await h.advanceTo(new Date(first - 1).toISOString())
    assert.deepEqual(host.values(pulse), [Value.boolean(false)])
    await h.advanceTo(new Date(first).toISOString())
    assert.deepEqual(host.values(pulse), [Value.boolean(false), Value.boolean(true)], "runs when planned")
    const times = new Set<number>()
    for (let day = 1; day <= 4; day++) {
      const at = planned(host, pulse)
      assert.ok(Math.abs(at - (t("2026-11-02T11:00:00Z") + day * 86_400_000)) <= 30 * 60_000)
      times.add(at % 86_400_000)
      await h.advanceTo(new Date(at).toISOString())
    }
    assert.ok(times.size > 1, "each run gets its own offset")
  })

  test("daylight saving in Vienna, spring: a pulse at a skipped time runs after the gap; a night window keeps its real length", async () => {
    h = new SchedulerHarness("2027-03-27T12:00:00Z")
    const host = await h.start()
    const pulse = await host.addSensor("pulse", { trigger: "time", time: "02:30" })
    const night = await host.addSensor("window", { trigger: "time", start: "22:00", end: "06:00" })
    await h.advanceTo("2027-03-27T21:00:00Z") // 22:00 CET
    assert.deepEqual(host.values(night).at(-1), Value.boolean(true))
    await h.advanceTo("2027-03-28T00:59:59Z")
    assert.deepEqual(host.values(pulse), [Value.boolean(false)], "02:30 doesn't exist this night")
    await h.advanceTo("2027-03-28T01:00:00Z") // 03:00 CEST
    assert.deepEqual(host.values(pulse).at(-1), Value.boolean(true))
    await h.advanceTo("2027-03-28T03:59:59Z")
    assert.deepEqual(host.values(night).at(-1), Value.boolean(true))
    await h.advanceTo("2027-03-28T04:00:00Z") // 06:00 CEST: a night of 7 hours
    assert.deepEqual(host.values(night).at(-1), Value.boolean(false))
  })

  test("daylight saving in Vienna, autumn: a repeated time runs once; a night window keeps its real length", async () => {
    h = new SchedulerHarness("2027-10-30T12:00:00Z")
    const host = await h.start()
    const pulse = await host.addSensor("pulse", { trigger: "time", time: "02:30" })
    const night = await host.addSensor("window", { trigger: "time", start: "22:00", end: "06:00" })
    await h.advanceTo("2027-10-30T20:00:00Z") // 22:00 CEST
    assert.deepEqual(host.values(night).at(-1), Value.boolean(true))
    await h.advanceTo("2027-10-31T04:59:59Z")
    assert.equal(host.values(pulse).filter(value => value.type === "boolean" && value.value).length, 1, "02:30 happens twice, runs once")
    assert.deepEqual(host.values(night).at(-1), Value.boolean(true))
    await h.advanceTo("2027-10-31T05:00:00Z") // 06:00 CET: a night of 9 hours
    assert.deepEqual(host.values(night).at(-1), Value.boolean(false))
  })

  test("a window opened by Run now stays open across a restart until its end", async () => {
    h = new SchedulerHarness()
    let host = await h.start()
    await host.addSensor("window", { trigger: "time", start: "22:00", end: "12:00" }, "Morning")
    assert.match(await host.action("run-now", { schedule: "sensor-1" }) ?? "", /until Mon 2026-11-02 12:00/)
    host = await h.restart(host)
    const window = await host.addSensor("window", { trigger: "time", start: "22:00", end: "12:00" }, "Morning")
    assert.deepEqual(host.values(window), [Value.boolean(true)])
    await h.advanceTo("2026-11-02T11:00:00Z")
    assert.deepEqual(host.values(window), [Value.boolean(true), Value.boolean(false)])
    assert.equal((host.store["run:sensor-1"] as { openUntil?: number }).openUntil, Date.parse("2026-11-02T11:00:00Z"))
  })
})
