import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { PluginDescription } from "@lox-nexus/plugin-sdk/wire"
import { EventBus } from "../bus/EventBus.ts"
import { CounterPlugin } from "../test-support/plugins/CounterPlugin.ts"
import { SignalRegistry } from "../wires/SignalRegistry.ts"
import { PackageDescriber } from "./PackageDescriber.ts"
import { PluginManager } from "./PluginManager.ts"
import type { PluginSupervisor } from "./PluginSupervisor.ts"
import type { PluginInstanceConfig, PluginState } from "./PluginTypes.ts"
import { WorkerTransport } from "./WorkerTransport.ts"

const entry = (name: string) => new URL(`../test-support/plugins/${name}.ts`, import.meta.url).href
const oneActuator = (id: string): PluginDescription => ({ config: {}, sensors: [], actuators: [{ id, label: id, params: {}, valueType: "any" }] })

/** polls (with real time; these are real workers) until the supervisor reaches the state */
const reaches = async (supervisor: PluginSupervisor, state: PluginState, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs
  while (supervisor.state !== state) {
    if (Date.now() > deadline) throw new Error(`still ${supervisor.state} (${supervisor.lastError ?? "no error"}), expected ${state}`)
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

describe("plugins in real worker threads (chaos fixtures)", { timeout: 60_000 }, () => {
  let bus: EventBus
  let manager: PluginManager
  const instance = (id: string, plugin: string): PluginInstanceConfig => ({ id, plugin, slug: id, label: id, config: {}, enabled: true })

  beforeEach(() => {
    bus = new EventBus()
    manager = new PluginManager({
      bus, registry: new SignalRegistry(), transport: new WorkerTransport({ heapMb: 32 }),
      store: { load: () => ({}), set: () => {}, delete: () => {} },
      logs: { log: () => {} },
      timings: { pingMs: 100, missedPings: 3, graceMs: 1000, backoffInitialMs: 300, stableMs: 60_000 }
    })
  })
  afterEach(() => manager.dispose())

  test("a running worker reports its heap and event loop use; a stopped one nothing", async () => {
    const counter = { id: "counter", name: "Counter", entry: entry("counter"), description: await PluginTestHost.describe(CounterPlugin) }
    const running = manager.add(instance("measured", "counter"), counter)
    await running.start()
    const first = await running.stats()
    assert.ok(first && first.heapUsed > 0 && first.heapTotal >= first.heapUsed, JSON.stringify(first))
    const second = await running.stats()
    assert.ok(second && second.utilization >= 0 && second.utilization <= 1, JSON.stringify(second))
    await running.stop()
    assert.equal(await running.stats(), undefined)
  })

  test("a plugin that throws in start ends in error; one that never says hello is reported", async () => {
    const counter = { id: "counter", name: "Counter", entry: entry("counter"), description: await PluginTestHost.describe(CounterPlugin) }
    const refusing = manager.add({ ...instance("refusing", "counter"), config: { refuse: true } }, counter)
    await refusing.start()
    assert.deepEqual([refusing.state, refusing.lastError], ["error", "refused on purpose"])
    const silent = manager.add(instance("silent", "silent"), { id: "silent", name: "Silent", entry: entry("silent"), description: oneActuator("x") })
    await silent.start()
    assert.match(silent.lastError ?? "", /before it could say hello \(does its entry call PluginEntry\.define\(\)\?\)/)
    await silent.stop()
  })

  test("a busy loop is detected by missed pings, terminated and restarted", async () => {
    const supervisor = manager.add(instance("busy", "busy"), { id: "busy", name: "Busy", entry: entry("busy"), description: oneActuator("spin") })
    supervisor.signals.add({ id: "spin", kind: "actuator", capability: "spin", params: {}, label: "", slug: "spin" })
    await supervisor.start()
    assert.equal(supervisor.state, "running")
    bus.command("busy/busy/actuator/spin", Value.null(), { source: { kind: "user", id: "t" } })
    await reaches(supervisor, "crashed")
    assert.match(supervisor.lastError ?? "", /did not answer 3 pings/)
    await reaches(supervisor, "running")
  })

  test("a heap bomb is killed by the memory limit", async () => {
    const supervisor = manager.add(instance("bomb", "bomb"), { id: "bomb", name: "Bomb", entry: entry("heap-bomb"), description: oneActuator("bomb") })
    supervisor.signals.add({ id: "bomb", kind: "actuator", capability: "bomb", params: {}, label: "", slug: "bomb" })
    await supervisor.start()
    bus.command("bomb/bomb/actuator/bomb", Value.null(), { source: { kind: "user", id: "t" } })
    await reaches(supervisor, "crashed")
    assert.match(supervisor.lastError ?? "", /out of memory \(limit 32 MB\)/)
  })

  test("a message type from a newer SDK is skipped and logged, not treated as a crash", async () => {
    const lines: string[] = []
    const chattyManager = new PluginManager({
      bus, registry: new SignalRegistry(), transport: new WorkerTransport(),
      store: { load: () => ({}), set: () => {}, delete: () => {} },
      logs: { log: (_instance, level, message) => void lines.push(`${level} ${message}`) }
    })
    const supervisor = chattyManager.add(instance("chatty", "chatty"), { id: "chatty", name: "Chatty", entry: entry("chatty"), description: oneActuator("x") })
    await supervisor.start()
    await new Promise(resolve => setTimeout(resolve, 100))
    assert.equal(supervisor.state, "running")
    assert.ok(lines.some(line => /warn ignored a message of unknown type "telemetry.v2"/.test(line)), lines.join("\n"))
    await chattyManager.dispose()
  })

  test("an unhandled promise rejection is logged and the worker keeps running", async () => {
    const lines: string[] = []
    const logged = new PluginManager({
      bus, registry: new SignalRegistry(), transport: new WorkerTransport(),
      store: { load: () => ({}), set: () => {}, delete: () => {} },
      logs: { log: (_instance, level, message) => void lines.push(`${level} ${message}`) }
    })
    const supervisor = logged.add(instance("forgetful", "forgetful"), { id: "forgetful", name: "Forgetful", entry: entry("forgetful"), description: oneActuator("x") })
    await supervisor.start()
    await new Promise(resolve => setTimeout(resolve, 200))
    assert.deepEqual([supervisor.state, supervisor.restarts], ["running", 0])
    assert.ok(lines.includes("error unhandled promise rejection: forgot to catch"), lines.join("\n"))
    assert.ok(lines.includes("error unhandled promise rejection: forgot again"), lines.join("\n"))
    await logged.dispose()
  })

  test("a stop and start cycle leaves no active handles behind", async () => {
    const counter = { id: "counter", name: "Counter", entry: entry("counter"), description: await PluginTestHost.describe(CounterPlugin) }
    const before = process.getActiveResourcesInfo().sort()
    const supervisor = manager.add(instance("cycle", "counter"), counter)
    await supervisor.start()
    assert.equal(supervisor.state, "running")
    await supervisor.stop()
    await supervisor.start()
    await supervisor.stop()
    await new Promise(resolve => setImmediate(resolve))
    // the test runner's own connections come and go; nothing may be left that wasn't there before
    const left = [...process.getActiveResourcesInfo()]
    for (const resource of before) left.splice(left.indexOf(resource), left.includes(resource) ? 1 : 0)
    assert.deepEqual(left, [])
  })
})

test("PackageDescriber asks a throwaway worker what the plugin offers", async () => {
  const describer = new PackageDescriber(new WorkerTransport())
  const description = await describer.describe(entry("counter"))
  assert.deepEqual([description.sensors.map(s => [s.id, s.valueType]), description.actuators.map(a => a.id)], [[["value", "number"]], ["set"]])
  await assert.rejects(describer.describe(entry("silent")), /before it could say hello/)
})
