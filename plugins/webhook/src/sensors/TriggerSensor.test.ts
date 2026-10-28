import assert from "node:assert/strict"
import { afterEach, describe, mock, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { WebhookHarness } from "../test-support/WebhookHarness.ts"

const { call } = WebhookHarness
const on = Value.boolean(true)
const off = Value.boolean(false)
const timeouts = () => process.getActiveResourcesInfo().filter(type => type === "Timeout").length

describe("trigger sensor", { timeout: 10_000 }, () => {
  const harness = new WebhookHarness()
  afterEach(async () => {
    await harness.cleanup()
    mock.timers.reset()
  })

  test("starts false, pulses true for pulseMs per call", async () => {
    mock.timers.enable({ apis: ["setTimeout"] })
    const host = await harness.start()
    const trigger = await host.addSensor("trigger", { hook: "bell", pulseMs: 500 })
    assert.deepEqual(host.values(trigger), [off])
    await call(host, { hook: "bell" })
    assert.deepEqual(host.values(trigger), [off, on])
    mock.timers.tick(499)
    assert.deepEqual(host.values(trigger), [off, on])
    mock.timers.tick(1)
    assert.deepEqual(host.values(trigger), [off, on, off])
  })

  test("the default pulse is one second", async () => {
    mock.timers.enable({ apis: ["setTimeout"] })
    const host = await harness.start()
    const trigger = await host.addSensor("trigger", { hook: "bell" })
    await call(host, { hook: "bell" })
    mock.timers.tick(999)
    assert.deepEqual(host.values(trigger).at(-1), on)
    mock.timers.tick(1)
    assert.deepEqual(host.values(trigger).at(-1), off)
  })

  test("a call during the pulse extends it instead of being cut short (old bug 2)", async () => {
    mock.timers.enable({ apis: ["setTimeout"] })
    const host = await harness.start()
    const trigger = await host.addSensor("trigger", { hook: "bell", pulseMs: 1000 })
    await call(host, { hook: "bell" })
    mock.timers.tick(800)
    await call(host, { hook: "bell" })
    mock.timers.tick(200)
    assert.deepEqual(host.values(trigger).at(-1), on, "the first call's timer no longer ends the pulse")
    mock.timers.tick(799)
    assert.deepEqual(host.values(trigger).at(-1), on)
    mock.timers.tick(1)
    assert.deepEqual(host.values(trigger).at(-1), off)
    assert.equal(host.values(trigger).filter(value => Value.equals(value, off)).length, 2, "one reset, plus the initial false")
  })

  test("each trigger on a hook keeps its own pulse length", async () => {
    mock.timers.enable({ apis: ["setTimeout"] })
    const host = await harness.start()
    const short = await host.addSensor("trigger", { hook: "bell", pulseMs: 100 })
    const long = await host.addSensor("trigger", { hook: "bell", pulseMs: 5000 })
    await call(host, { hook: "bell" })
    mock.timers.tick(100)
    assert.deepEqual([host.values(short).at(-1), host.values(long).at(-1)], [off, on])
    mock.timers.tick(4900)
    assert.deepEqual(host.values(long).at(-1), off)
  })

  test("removing the signal mid-pulse clears its timer", async () => {
    const host = await harness.start()
    const trigger = await host.addSensor("trigger", { hook: "bell", pulseMs: 3_600_000 })
    const before = timeouts()
    await call(host, { hook: "bell" })
    await call(host, { hook: "bell" })
    assert.equal(timeouts(), before + 1, "a second call replaces the timer instead of adding one")
    await host.remove(trigger)
    assert.equal(timeouts(), before)
    assert.equal((await call(host, { hook: "bell" })).status, 404, "the hook went with its last signal")
  })

  test("params: pulseMs 50 to 3 600 000, method any, GET, POST or PUT", async () => {
    const host = await harness.start()
    await assert.rejects(host.addSensor("trigger", { hook: "a", pulseMs: 49 }))
    await assert.rejects(host.addSensor("trigger", { hook: "a", pulseMs: 3_600_001 }))
    await assert.rejects(host.addSensor("trigger", { hook: "a", method: "DELETE" }))
    await host.addSensor("trigger", { hook: "a", pulseMs: 50, method: "PUT" })
  })
})
