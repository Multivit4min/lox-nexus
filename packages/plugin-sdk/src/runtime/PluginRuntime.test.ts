import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { PluginTestHost } from "../testing/PluginTestHost.ts"
import { EchoPlugin } from "../testing/fixtures/EchoPlugin.ts"
import { Value } from "../values/Value.ts"

describe("PluginRuntime through PluginTestHost", () => {
  test("init validates the config and applies its defaults; failures are reported", async () => {
    await assert.rejects(PluginTestHost.start(EchoPlugin, { config: { greeting: 3 } }), /invalid config/)
    await assert.rejects(PluginTestHost.start(EchoPlugin, { config: { failStart: true } }), /start failed on purpose/)
    const host = await PluginTestHost.start(EchoPlugin, { store: { starts: 2 } })
    assert.equal(host.store.starts, 3, "the store starts from what was persisted, and writes come back")
    await host.stop()
  })

  test("a sensor emits; an actuator converts, runs and reports errors", async () => {
    const host = await PluginTestHost.start(EchoPlugin)
    const counter = await host.addSensor("counter", { start: 5 })
    assert.deepEqual(host.values(counter), [Value.number(5)])
    const set = await host.addActuator("set")
    await host.actuate(set, Value.string("7"))
    assert.deepEqual(host.values(counter), [Value.number(5), Value.number(7)], "the string was converted to a number")
    await assert.rejects(host.actuate(set, Value.number(-1)), /negative values are refused/)
    await assert.rejects(host.addSensor("counter", { start: "x" }), /invalid params/)
    await assert.rejects(host.addSensor("nope"), /has no sensor "nope"/)
    await host.remove(counter)
    await host.actuate(set, Value.number(8))
    assert.equal(host.values(counter).length, 2, "a removed sensor emits nothing")
    await host.stop()
  })

  test("emits and logs while an actuator runs carry the cause", async () => {
    const host = await PluginTestHost.start(EchoPlugin)
    const counter = await host.addSensor("counter", { start: 0 })
    const set = await host.addActuator("set")
    await host.actuate(set, Value.number(3), "bus-message-1")
    const emit = host.sent.findLast(m => m.type === "emit" && m.signalId === counter)
    const log = host.sent.findLast(m => m.type === "log")
    assert.deepEqual([emit?.type === "emit" && emit.causeId, log?.type === "log" && log.causeId], ["bus-message-1", "bus-message-1"])
    await host.stop()
  })

  test("a latest actuator skips the values that were overtaken", async () => {
    const host = await PluginTestHost.start(EchoPlugin)
    const slow = await host.addActuator("slow")
    const plugin = host as unknown as { runtime: { plugin: EchoPlugin } }
    let open = () => {}
    plugin.runtime.plugin.gate = new Promise(resolve => (open = resolve))
    const first = host.actuate(slow, Value.number(1))
    const second = host.actuate(slow, Value.number(2))
    const third = host.actuate(slow, Value.number(3))
    await assert.rejects(second, /a newer value arrived/)
    open()
    await Promise.all([first, third])
    assert.deepEqual(plugin.runtime.plugin.received, [1, 3])
    await host.stop()
  })

  test("webhooks, catalog, panel and describe", async () => {
    const host = await PluginTestHost.start(EchoPlugin, { config: { greeting: "hello" } })
    assert.deepEqual(await host.http({ path: "/echo", body: "world" }), { status: 200, headers: {}, body: "hello world" })
    assert.equal((await host.http({ path: "/missing" })).status, 404)
    assert.equal((await host.catalog())[0]?.entries?.[0]?.capability, "counter")
    assert.deepEqual(await host.panel(), { type: "keyValue", items: [{ label: "received", value: "0" }] })
    const description = await PluginTestHost.describe(EchoPlugin)
    assert.deepEqual([description.sensors.map(s => s.id), description.actuators.map(a => [a.id, a.valueType])], [["counter"], [["set", "number"], ["slow", "any"]]])
    assert.equal((description.config.properties as Record<string, unknown>).greeting !== undefined, true)
    await host.stop()
  })
})
