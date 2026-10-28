import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { PluginTestHost } from "../testing/PluginTestHost.ts"
import { EchoPlugin } from "../testing/fixtures/EchoPlugin.ts"
import { Value } from "../values/Value.ts"
import { Actuator } from "../plugin/Actuator.ts"
import { Plugin, type PluginClass } from "../plugin/Plugin.ts"
import { Sensor } from "../plugin/Sensor.ts"
import { PluginDescriber } from "./PluginDescriber.ts"

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
    const plugin = host.plugin
    let open = () => {}
    plugin.gate = new Promise(resolve => (open = resolve))
    const first = host.actuate(slow, Value.number(1))
    const second = host.actuate(slow, Value.number(2))
    const third = host.actuate(slow, Value.number(3))
    await assert.rejects(second, /a newer value arrived/)
    open()
    await Promise.all([first, third])
    assert.deepEqual(plugin.received, [1, 3])
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

test("store values must survive JSON; actuators reject what is still waiting when removed", async () => {
  const host = await PluginTestHost.start(EchoPlugin)
  const plugin = host.plugin
  assert.throws(() => plugin.store.set("big", 10n), /BigInt/)
  const circular: { self?: unknown } = {}
  circular.self = circular
  assert.throws(() => plugin.store.set("loop", circular), /circular/i)
  assert.throws(() => plugin.store.set("u", undefined), /use delete/)
  const slow = await host.addActuator("slow")
  let open = () => {}
  plugin.gate = new Promise(resolve => (open = resolve))
  const running = host.actuate(slow, Value.number(1))
  const waiting = assert.rejects(host.actuate(slow, Value.number(2)), /the actuator was removed/)
  await host.remove(slow)
  await waiting
  open()
  await running
  assert.deepEqual(plugin.received, [1], "the waiting command never ran")
  await host.stop()
})

test("unhandled rejections go to the plugin, which logs them by default; a throwing override is logged too", async () => {
  class Quiet extends Plugin {}
  class Loud extends Plugin {
    override unhandledRejection(reason: unknown) {
      this.log.warn(`script failed: ${String(reason)}`)
    }
  }
  class Broken extends Plugin {
    override unhandledRejection(): void {
      throw new Error("override broke")
    }
  }
  const logs = async (type: PluginClass, reason: unknown) => {
    const host = await PluginTestHost.start(type)
    host.unhandledRejection(reason)
    await host.stop()
    return host.sent.flatMap(message => (message.type === "log" ? [`${message.level} ${message.message}`] : []))
  }
  assert.deepEqual(await logs(Quiet, new Error("boom")), ["error unhandled promise rejection: boom"])
  assert.deepEqual(await logs(Loud, "plain"), ["warn script failed: plain"])
  assert.deepEqual(await logs(Broken, "x"), ["error unhandled promise rejection: override broke"])
})

test("describe passes a description on, and leaves the field out without one", () => {
  class Described extends Sensor<Plugin, object> {
    static readonly id = "described"
    static readonly description = "What it reads"
  }
  class Plain extends Actuator<Plugin, object> {
    static readonly id = "plain"
    run() {}
  }
  class DescribedPlugin extends Plugin {
    static readonly sensors = [Described]
    static readonly actuators = [Plain]
  }
  const description = PluginDescriber.describe(DescribedPlugin)
  assert.equal(description.sensors[0]?.description, "What it reads")
  assert.equal("description" in description.actuators[0]!, false)
})

test("the plugin knows its slug, and each sensor and actuator its signal's id and label", async () => {
  const seen: string[] = []
  class Named extends Sensor<Plugin, object> {
    static readonly id = "named"
    override start() {
      seen.push(`${this.plugin.slug} ${this.signal.id} "${this.signal.label}"`)
    }
  }
  class Acting extends Actuator<Plugin, object> {
    static readonly id = "acting"
    override start() {
      seen.push(`actuator ${this.signal.id} "${this.signal.label}"`)
    }

    run() {}
  }
  class Labelled extends Plugin {
    static readonly sensors = [Named]
    static readonly actuators = [Acting]
  }
  const host = await PluginTestHost.start(Labelled, { slug: "home" })
  const sensor = await host.addSensor("named", {}, "Kitchen light")
  const unnamed = await host.addSensor("named")
  const actuator = await host.addActuator("acting", {}, "Blinds")
  await host.stop()
  assert.deepEqual(seen, [`home ${sensor} "Kitchen light"`, `home ${unnamed} ""`, `actuator ${actuator} "Blinds"`])
})

test("recover() clears a failure once, and only after a fail()", async () => {
  class Flaky extends Sensor<FlakyPlugin, object> {
    static readonly id = "flaky"
    override start() {
      this.plugin.next = step => (step === "fail" ? this.fail("gone") : step === "recover" ? this.recover() : this.emit(Value.number(1)))
    }
  }
  class FlakyPlugin extends Plugin {
    static readonly sensors = [Flaky]
    next: (step: "fail" | "recover" | "emit") => void = () => {}
  }
  const host = await PluginTestHost.start(FlakyPlugin)
  await host.addSensor("flaky")
  const plugin = host.plugin
  for (const step of ["recover", "fail", "recover", "recover", "fail", "emit", "recover"] as const) plugin.next(step)
  await host.stop()
  const kinds = host.sent.filter(message => ["signal.error", "signal.recovered", "emit"].includes(message.type)).map(message => message.type)
  assert.deepEqual(kinds, ["signal.error", "signal.recovered", "signal.error", "emit"])
})

test("oversized store values throw at the call, log data is left out, a huge answer fails the request", async () => {
  const big = "x".repeat(1024 * 1024 + 1)
  class Big extends Plugin {
    override start() {
      assert.throws(() => this.store.set("k", big), /store value for "k" is 1\.0 MiB; the limit is 1\.0 MiB/)
      this.store.set("ok", "x".repeat(1000))
      this.log.info("fetched", { response: "y".repeat(70 * 1024) })
      this.log.info("small", { a: 1 })
    }

    override catalog() {
      return [{ label: "z".repeat(17 * 1024 * 1024) }] as never
    }
  }
  const host = await PluginTestHost.start(Big)
  const logs = host.sent.flatMap(message => message.type === "log" ? [message.data] : [])
  assert.deepEqual(logs, ["[log data left out: 71 KiB, more than 64 KiB]", { a: 1 }])
  assert.deepEqual(host.sent.flatMap(message => message.type === "store.set" ? [message.key] : []), ["ok"])
  await assert.rejects(host.catalog(), /the answer is 17\.0 MiB; the limit is 16\.0 MiB/)
  await host.stop()
})
