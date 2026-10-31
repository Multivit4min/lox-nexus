import assert from "node:assert/strict"
import { afterEach, beforeEach, mock, test } from "node:test"
import { Action, Plugin, z } from "@lox-nexus/plugin-sdk"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { EventBus } from "../bus/EventBus.ts"
import { FakePluginTransport } from "../test-support/FakePluginTransport.ts"
import { SignalRegistry } from "../wires/SignalRegistry.ts"
import { PluginManager } from "./PluginManager.ts"
import type { OpenOptions } from "./PluginTransport.ts"
import type { PluginInstanceConfig, PluginPackage } from "./PluginTypes.ts"

class Greet extends Action<Plugin, { name: string }> {
  static readonly id = "greet"
  static readonly input = z.object({ name: z.string() })
  run() {
    return `hello ${this.input.name}`
  }
}

class Hang extends Action {
  static readonly id = "hang"
  run() {
    return new Promise<void>(() => {})
  }
}

class Pairing extends Action {
  static readonly id = "pairing"
  run() {
    this.progress("opening the window", 0.5)
    this.plugin.panelChanged()
    return { message: "Scan it", panel: { type: "qr" as const, data: "MT:1" } }
  }
}

class Actor extends Plugin {
  static readonly actions = [Greet, Hang, Pairing]
}

const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve))
}
const instance: PluginInstanceConfig = { id: "a", plugin: "actor", slug: "actor", label: "Actor", config: {}, enabled: true }

let manager: PluginManager
const opened: OpenOptions[] = []
const panels: string[] = []

beforeEach(() => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval"] })
  opened.length = 0
  const fake = new FakePluginTransport().add("actor.ts", Actor)
  const transport = { open: (entry: string, options: OpenOptions = {}) => (opened.push(options), fake.open(entry)) }
  panels.length = 0
  manager = new PluginManager({
    bus: new EventBus(), registry: new SignalRegistry(), transport, panelChanged: id => panels.push(id),
    store: { load: () => ({}), set: () => undefined, delete: () => undefined }, logs: { log: () => undefined },
    timings: { actionMs: 5_000 }
  })
})
afterEach(async () => {
  const stopping = manager.dispose()
  await settle()
  mock.timers.tick(10_000)
  await stopping
  mock.timers.reset()
})

async function running(heapMb?: number) {
  const pkg: PluginPackage = { id: "actor", name: "Actor", entry: "actor.ts", description: await PluginTestHost.describe(Actor), ...(heapMb ? { heapMb } : {}) }
  const supervisor = manager.add(instance, pkg)
  const starting = supervisor.start()
  await settle()
  await starting
  return supervisor
}

test("an action reaches the plugin with its input and answers with the plugin's message", async () => {
  const supervisor = await running()
  const answer = supervisor.calls.action("greet", { name: "Echo" })
  await settle()
  assert.deepEqual(await answer, { message: "hello Echo" })
  const refused = assert.rejects(supervisor.calls.action("greet", {}), /invalid input/)
  await settle()
  await refused
})

test("an action's progress reaches the caller, its answer keeps the panel part, and its panelChanged() the host", async () => {
  const supervisor = await running()
  const progress: unknown[] = []
  const answer = supervisor.calls.action("pairing", {}, (text, fraction) => progress.push([text, fraction]))
  await settle()
  assert.deepEqual(await answer, { message: "Scan it", panel: { type: "qr", data: "MT:1" } })
  assert.deepEqual(progress, [["opening the window", 0.5]])
  assert.deepEqual(panels, ["a"])
})

test("an action has its own timeout, longer than other requests", async () => {
  const supervisor = await running()
  const hanging = supervisor.calls.action("hang", {})
  let settled = false
  hanging.catch(() => undefined).finally(() => (settled = true))
  await settle()
  mock.timers.tick(4_999)
  await settle()
  assert.equal(settled, false)
  mock.timers.tick(1)
  await assert.rejects(hanging, /within 5000 ms/)
})

test("the plugin's own heap limit is passed to the transport", async () => {
  await running(256)
  assert.deepEqual(opened, [{ heapMb: 256 }])
})

test("an action on a plugin that isn't running is refused at once", async () => {
  const pkg: PluginPackage = { id: "actor", name: "Actor", entry: "actor.ts", description: await PluginTestHost.describe(Actor) }
  const supervisor = manager.add(instance, pkg)
  await assert.rejects(supervisor.calls.action("greet", { name: "x" }), /not running/)
})
