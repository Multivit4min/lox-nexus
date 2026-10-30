import assert from "node:assert/strict"
import { afterEach, beforeEach, mock, test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import type { LogLevel } from "@lox-nexus/plugin-sdk/wire"
import { EventBus } from "../bus/EventBus.ts"
import { FakePluginTransport } from "../test-support/FakePluginTransport.ts"
import { CounterPlugin } from "../test-support/plugins/CounterPlugin.ts"
import { SignalRegistry } from "../wires/SignalRegistry.ts"
import { PluginManager } from "./PluginManager.ts"

/** lets queued microtasks and immediates (the fake worker's messages) run */
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve))
}

let manager: PluginManager
let transport: FakePluginTransport
let level: LogLevel = "info"
let onLevelRead = () => {}
const listeners = new Set<(level: LogLevel) => void>()
const setLevel = (next: LogLevel) => {
  level = next
  for (const listener of listeners) listener(next)
}

beforeEach(() => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval"] })
  level = "info"
  onLevelRead = () => {}
  listeners.clear()
  manager = new PluginManager({
    bus: new EventBus({ topicKinds: new SignalRegistry() }), registry: new SignalRegistry(),
    transport: (transport = new FakePluginTransport().add("counter.ts", CounterPlugin)),
    store: { load: () => ({}), set: () => undefined, delete: () => undefined },
    logs: {
      log: () => undefined,
      level: () => {
        onLevelRead()
        onLevelRead = () => {}
        return level
      },
      onLevel: (_id, listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      }
    },
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

const levelMessages = () => transport.last.received.flatMap(message =>
  message.type === "init" ? [`init ${message.logLevel}`] : message.type === "log.level" ? [message.level] : [])

test("the worker starts with the instance's level and hears each change once; a disposed supervisor stops listening", async () => {
  const pkg = { id: "counter", name: "Counter", entry: "counter.ts", version: "1.0.0", description: await PluginTestHost.describe(CounterPlugin) }
  const supervisor = manager.add({ id: "i1", plugin: "counter", slug: "home", label: "Home", config: {}, enabled: true }, pkg)
  const started = supervisor.start()
  await settle()
  await started
  setLevel("debug")
  setLevel("debug")
  setLevel("info")
  await settle()
  assert.deepEqual(levelMessages(), ["init info", "debug", "info"])
  const stopping = manager.dispose()
  await settle()
  mock.timers.tick(10_000)
  await stopping
  assert.equal(listeners.size, 0)
})

test("a level change while the worker starts reaches it once it is ready", async () => {
  const pkg = { id: "counter", name: "Counter", entry: "counter.ts", version: "1.0.0", description: await PluginTestHost.describe(CounterPlugin) }
  const supervisor = manager.add({ id: "i1", plugin: "counter", slug: "home", label: "Home", config: {}, enabled: true }, pkg)
  // changed right after init read it, before the worker is ready
  onLevelRead = () => queueMicrotask(() => setLevel("debug"))
  const started = supervisor.start()
  await settle()
  await started
  assert.deepEqual(levelMessages(), ["init info", "debug"])
})
