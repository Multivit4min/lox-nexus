import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, mock, test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { BusMessage } from "../bus/BusMessage.ts"
import { EventBus } from "../bus/EventBus.ts"
import { FakePluginTransport } from "../test-support/FakePluginTransport.ts"
import { CounterPlugin } from "../test-support/plugins/CounterPlugin.ts"
import { SignalRegistry } from "../wires/SignalRegistry.ts"
import { PluginManager } from "./PluginManager.ts"
import type { PluginInstanceConfig, PluginPackage } from "./PluginTypes.ts"

/** lets queued microtasks and immediates (the fake worker's messages) run */
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve))
}

describe("PluginSupervisor", () => {
  let bus: EventBus
  let registry: SignalRegistry
  let transport: FakePluginTransport
  let manager: PluginManager
  let pkg: PluginPackage
  const stored = new Map<string, unknown>()
  const logs: string[] = []
  const instance = (overrides: Partial<PluginInstanceConfig> = {}): PluginInstanceConfig =>
    ({ id: "i1", plugin: "counter", slug: "home", label: "Home", config: {}, enabled: true, ...overrides })
  const statuses = () => bus.current("system/plugin/home/status")?.value

  beforeEach(async () => {
    mock.timers.enable({ apis: ["setTimeout", "setInterval"] })
    bus = new EventBus({ topicKinds: (registry = new SignalRegistry()) })
    transport = new FakePluginTransport().add("counter.ts", CounterPlugin)
    pkg = { id: "counter", name: "Counter", entry: "counter.ts", description: await PluginTestHost.describe(CounterPlugin) }
    stored.clear()
    logs.length = 0
    manager = new PluginManager({
      bus, registry, transport,
      store: { load: () => ({ last: 1 }), set: (_id, key, value) => void stored.set(key, value), delete: (_id, key) => void stored.delete(key) },
      logs: { log: (_instance, level, message) => void logs.push(`${level} ${message}`) },
      timings: { pingMs: 100, missedPings: 3, backoffInitialMs: 1000, backoffMaxMs: 8000, stableMs: 60_000 }
    })
  })
  afterEach(async () => {
    const stopping = manager.dispose()
    await settle()
    mock.timers.tick(10_000)
    await stopping
    mock.timers.reset()
  })

  test("runs the plugin: sensor values reach the bus, commands come back as results with their cause", async () => {
    const supervisor = manager.add(instance(), pkg)
    supervisor.signals.add({ id: "v", kind: "sensor", capability: "value", params: { start: 5 }, label: "Value", slug: "value" })
    supervisor.signals.add({ id: "s", kind: "actuator", capability: "set", params: {}, label: "Set", slug: "set" })
    const starting = supervisor.start()
    await settle()
    await starting
    assert.equal(supervisor.state, "running")
    assert.deepEqual(statuses(), Value.string("running"))
    assert.deepEqual(bus.current("counter/home/sensor/value")?.value, Value.number(5))
    assert.deepEqual(logs, ["info started"])

    const seen: BusMessage[] = []
    bus.tap(message => seen.push(message))
    bus.command("counter/home/actuator/set", Value.string("8"), { source: { kind: "user", id: "t" } })
    await settle()
    const command = seen.find(m => m.kind === "command")!
    const value = seen.find(m => m.topic === "counter/home/sensor/value")!
    const result = seen.find(m => m.kind === "result")!
    assert.deepEqual([value.value, value.causedBy, value.source.kind], [Value.number(8), command.id, "plugin"])
    assert.deepEqual([result.outcome?.ok, result.causedBy], [true, command.id])
    assert.equal(stored.get("last"), 8, "store writes reach the host")
  })

  test("a plugin that refuses to start ends in error and is not restarted", async () => {
    const supervisor = manager.add(instance({ config: { refuse: true } }), pkg)
    const starting = supervisor.start()
    await settle()
    await starting
    assert.deepEqual([supervisor.state, supervisor.lastError], ["error", "refused on purpose"])
    mock.timers.tick(60_000)
    await settle()
    assert.equal(transport.opened.length, 1)
  })

  test("a crash restarts with a doubling backoff and recreates the signals", async () => {
    const supervisor = manager.add(instance(), pkg)
    supervisor.signals.add({ id: "v", kind: "sensor", capability: "value", params: { start: 1 }, label: "", slug: "value" })
    const starting = supervisor.start()
    await settle()
    await starting
    transport.last.crash("ran out of memory")
    await settle()
    assert.deepEqual([supervisor.state, supervisor.lastError], ["crashed", "ran out of memory"])
    mock.timers.tick(999)
    await settle()
    assert.equal(transport.opened.length, 1, "not before the backoff")
    mock.timers.tick(1)
    await settle()
    assert.deepEqual([supervisor.state, transport.opened.length, supervisor.restarts], ["running", 2, 1])
    assert.ok(transport.last.received.some(m => m.type === "signal.add"), "signals are recreated in the new worker")
    transport.last.crash()
    await settle()
    mock.timers.tick(1999)
    await settle()
    assert.equal(transport.opened.length, 2, "the second delay is 2 s")
    mock.timers.tick(1)
    await settle()
    assert.deepEqual([transport.opened.length, supervisor.restarts], [3, 2])
    await supervisor.stop()
    assert.equal(supervisor.restarts, 0, "a stop from outside resets the count")
  })

  test("a hung plugin is terminated after missed pings", async () => {
    const supervisor = manager.add(instance(), pkg)
    const starting = supervisor.start()
    await settle()
    await starting
    transport.last.hung = true
    for (let i = 0; i < 4; i++) {
      mock.timers.tick(100)
      await settle()
    }
    assert.equal(supervisor.state, "crashed")
    assert.match(supervisor.lastError ?? "", /did not answer 3 pings/)
    assert.equal(transport.last.gone, true)
  })

  test("stop shuts the plugin down and cancels a pending restart; commands while stopped fail", async () => {
    const supervisor = manager.add(instance(), pkg)
    supervisor.signals.add({ id: "s", kind: "actuator", capability: "set", params: {}, label: "", slug: "set" })
    const starting = supervisor.start()
    await settle()
    await starting
    transport.last.crash()
    await settle()
    await supervisor.stop()
    mock.timers.tick(10_000)
    await settle()
    assert.deepEqual([supervisor.state, transport.opened.length], ["stopped", 1])
    const results: BusMessage[] = []
    bus.subscribe("counter/#", message => void (message.kind === "result" && results.push(message)))
    bus.command("counter/home/actuator/set", Value.number(1), { source: { kind: "user", id: "t" } })
    await settle()
    assert.deepEqual(results.map(r => r.outcome?.error), ["the plugin is not running"])
  })

  test("a degraded status reported during start is kept; a failing store write is reported, not thrown", async () => {
    const supervisor = manager.add(instance({ config: { degraded: true } }), pkg)
    supervisor.signals.add({ id: "s", kind: "actuator", capability: "set", params: {}, label: "", slug: "set" })
    const starting = supervisor.start()
    await settle()
    await starting
    assert.deepEqual([supervisor.state, supervisor.statusMessage], ["degraded", "device unreachable"])
    const errors: string[] = []
    bus.subscribe("system/plugin/home/error", message => void errors.push(message.text ?? ""))
    const failing = manager.add(instance({ id: "i2", slug: "other" }), pkg)
    Object.assign((failing as unknown as { deps: { store: object } }).deps.store, { set: () => { throw new Error("database is locked") } })
    stored.clear()
    bus.command("counter/home/actuator/set", Value.number(4), { source: { kind: "user", id: "t" } })
    await settle()
    assert.ok(errors.some(text => /handling a "store.set" message failed: database is locked/.test(text)), errors.join("; "))
  })

  test("disposing during start resolves and leaves no worker behind", async () => {
    for (const waitForWorker of [false, true]) {
      const supervisor = manager.add(instance({ id: `d${waitForWorker}`, slug: `d${waitForWorker}` }), pkg)
      const opened = transport.opened.length
      const starting = supervisor.start()
      while (waitForWorker && transport.opened.length === opened) await Promise.resolve()
      const disposing = supervisor.dispose()
      await settle()
      await Promise.all([starting, disposing])
      assert.ok(transport.opened.every(connection => connection.gone), `no worker left (waited: ${waitForWorker})`)
    }
  })

  test("signals: invalid params are refused while running; a new slug moves topics, a degraded status is shown", async () => {
    const supervisor = manager.add(instance(), pkg)
    const starting = supervisor.start()
    await settle()
    await starting
    const refused = assert.rejects(supervisor.calls.addSignal({ id: "bad", kind: "sensor", capability: "value", params: { start: "x" }, label: "", slug: "bad" }), /invalid params/)
    await settle()
    await refused
    assert.equal(registry.get("bad"), undefined, "a refused signal is not kept")
    assert.throws(() => supervisor.signals.add({ id: "x", kind: "sensor", capability: "nope", params: {}, label: "", slug: "x" }), /has no sensor "nope"/)

    const adding2 = supervisor.calls.addSignal({ id: "s", kind: "actuator", capability: "set", params: {}, label: "", slug: "set" })
    await settle()
    await adding2
    bus.command("counter/home/actuator/set", Value.number(13), { source: { kind: "user", id: "t" } })
    await settle()
    assert.equal(supervisor.state, "degraded")

    const updating = manager.update(instance({ slug: "house" }))
    await settle()
    await updating
    assert.deepEqual([registry.get("s")?.topic, supervisor.state], ["counter/house/actuator/set", "running"])
    assert.throws(() => manager.add(instance({ id: "i2", slug: "house" }), pkg), /slug "house"/)
  })
})
