import assert from "node:assert/strict"
import { afterEach, beforeEach, mock, test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { BusMessage } from "../bus/BusMessage.ts"
import { EventBus } from "../bus/EventBus.ts"
import { FakePluginTransport } from "../test-support/FakePluginTransport.ts"
import { CounterPlugin } from "../test-support/plugins/CounterPlugin.ts"
import { SignalRegistry } from "../wires/SignalRegistry.ts"
import { PluginManager } from "./PluginManager.ts"
import type { PluginPackage } from "./PluginTypes.ts"

/** lets queued microtasks and immediates (the fake worker's messages) run */
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve))
}

let bus: EventBus
let registry: SignalRegistry
let manager: PluginManager
let transport: FakePluginTransport
let v1: PluginPackage

beforeEach(async () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval"] })
  bus = new EventBus({ topicKinds: (registry = new SignalRegistry()) })
  v1 = { id: "counter", name: "Counter", entry: "counter.ts", version: "1.0.0", description: await PluginTestHost.describe(CounterPlugin) }
  manager = new PluginManager({
    bus, registry, transport: (transport = new FakePluginTransport().add("counter.ts", CounterPlugin)),
    store: { load: () => ({}), set: () => undefined, delete: () => undefined }, logs: { log: () => undefined },
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

/** lets a lifecycle step finish; the fake worker answers its shutdown without timers running */
async function step(work: Promise<unknown>) {
  await settle()
  await work
}

async function command(value: number, topic = "counter/home/actuator/set") {
  const results: BusMessage[] = []
  const subscription = bus.subscribe(topic, message => void (message.kind === "result" && results.push(message)))
  bus.command(topic, Value.number(value), { source: { kind: "user", id: "t" } })
  await settle()
  subscription.dispose()
  return results.map(result => result.outcome)
}

test("an update orphans signals whose capability is gone and retypes the rest; a rollback restores them", async () => {
  const supervisor = manager.add({ id: "i1", plugin: "counter", slug: "home", label: "Home", config: {}, enabled: true }, v1)
  supervisor.signals.add({ id: "v", kind: "sensor", capability: "value", params: { start: 5 }, label: "Value", slug: "value" })
  supervisor.signals.add({ id: "s", kind: "actuator", capability: "set", params: {}, label: "Set", slug: "set" })
  await step(supervisor.start())
  assert.equal(supervisor.state, "running")
  const sent = transport.last.received.map(message => message.type === "init" ? message.slug : message.type === "signal.add" ? message.signal.label : undefined)
  assert.deepEqual(sent.filter(Boolean), ["home", "Value", "Set"], "the plugin learns its slug and each signal's label")

  const description = { ...v1.description, actuators: [], sensors: v1.description.sensors.map(sensor => ({ ...sensor, valueType: "string" as const })) }
  await step(manager.replacePackage({ ...v1, version: "2.0.0", description }))
  assert.equal(supervisor.state, "running")
  const orphan = supervisor.signals.get("s")!
  assert.equal(orphan.orphaned, true)
  assert.equal(orphan.error, "Counter 2.0.0 no longer offers actuator \"set\"")
  // still registered, so its wires and topic stay
  assert.equal(registry.get("s")?.topic, "counter/home/actuator/set")
  assert.equal(registry.get("v")?.valueType, "string")
  assert.deepEqual(supervisor.signals.specs().map(spec => spec.id), ["v"])
  assert.deepEqual((await command(4)).map(outcome => outcome?.error), ["Counter 2.0.0 no longer offers actuator \"set\""])

  await step(manager.replacePackage(v1))
  assert.equal(supervisor.signals.get("s")?.orphaned, undefined)
  assert.equal(supervisor.signals.get("s")?.error, undefined)
  assert.equal(registry.get("v")?.valueType, "number")
  assert.deepEqual((await command(4)).map(outcome => outcome?.ok), [true])
})

test("an orphan stored before a restart is restored (typed any), moves with the slug, and comes back with its capability", async () => {
  const v2 = { ...v1, version: "2.0.0", description: { ...v1.description, actuators: [] } }
  const supervisor = manager.add({ id: "i1", plugin: "counter", slug: "home", label: "Home", config: {}, enabled: true }, v2)
  const restored = supervisor.signals.restore({ id: "s", kind: "actuator", capability: "set", params: {}, label: "Set", slug: "set" })
  assert.deepEqual([restored.orphaned, restored.valueType, restored.error], [true, "any", "Counter 2.0.0 no longer offers actuator \"set\""])
  assert.equal(registry.get("s")?.valueType, "any")
  // stopped or not, an orphaned actuator answers with its reason
  assert.deepEqual((await command(1)).map(outcome => outcome?.error), ["Counter 2.0.0 no longer offers actuator \"set\""])

  await step(manager.update({ id: "i1", plugin: "counter", slug: "house", label: "Home", config: {}, enabled: true }))
  assert.equal(supervisor.config.slug, "house")
  assert.equal(registry.get("s")?.topic, "counter/house/actuator/set")
  assert.equal(supervisor.signals.get("s")?.orphaned, true)

  await step(manager.replacePackage(v1))
  assert.equal(supervisor.signals.get("s")?.orphaned, undefined)
  assert.equal(registry.get("s")?.valueType, v1.description.actuators[0]?.valueType)
})

test("a sensor's failure clears when it recovers without a value", async () => {
  const supervisor = manager.add({ id: "i1", plugin: "counter", slug: "home", label: "Home", config: {}, enabled: true }, v1)
  supervisor.signals.add({ id: "v", kind: "sensor", capability: "value", params: { start: 404 }, label: "Value", slug: "value" })
  supervisor.signals.add({ id: "s", kind: "actuator", capability: "set", params: {}, label: "Set", slug: "set" })
  await step(supervisor.start())
  assert.equal(supervisor.signals.get("v")?.error, "not found")
  await command(410)
  assert.equal(supervisor.signals.get("v")?.error, undefined)
  assert.equal(bus.current("counter/home/sensor/value"), undefined, "recovering sends no value")
})
