import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, mock, test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { HostMessage } from "@lox-nexus/plugin-sdk/wire"
import { EventBus } from "../bus/EventBus.ts"
import { SignalSelection } from "../selection/SignalSelection.ts"
import { FakePluginTransport } from "../test-support/FakePluginTransport.ts"
import { ExporterPlugin } from "../test-support/plugins/ExporterPlugin.ts"
import { SignalRegistry } from "../wires/SignalRegistry.ts"
import { PluginManager } from "./PluginManager.ts"
import { WatchFeed } from "./WatchFeed.ts"

const loxone = { source: { kind: "loxone" as const, id: "haus" } }
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve))
}

function setup(selection: SignalSelection) {
  const registry = new SignalRegistry()
  const bus = new EventBus({ topicKinds: registry })
  for (const id of ["temp", "door"]) registry.register({ id, topic: `loxone/haus/in/${id}`, label: id, direction: "source", valueType: "number", delivery: "state", owner: { kind: "miniserver", id: "haus" } })
  let chosen = selection
  return { registry, bus, choose: (next: SignalSelection) => (chosen = next), deps: { bus, signals: registry, selection: () => chosen } }
}

describe("WatchFeed", () => {
  beforeEach(() => mock.timers.enable({ apis: ["setInterval"] }))
  afterEach(() => mock.timers.reset())

  test("sends the chosen signals and their current values, then batches; at most two batches wait for an ack", async () => {
    const { bus, choose, deps } = setup(new SignalSelection("selected", [{ target: { signalId: "temp" }, include: true }]))
    bus.publish("loxone/haus/in/temp", Value.number(20), loxone)
    const sent: HostMessage[] = []
    const feed = new WatchFeed("x", deps, message => sent.push(message))
    assert.deepEqual(sent.map(m => m.type), ["watch.signals", "watch.values"])
    assert.deepEqual(sent[0]!.type === "watch.signals" && sent[0]!.signals.map(s => s.id), ["temp"])
    assert.deepEqual(sent[1]!.type === "watch.values" && sent[1]!.values.map(v => [v.signalId, v.initial]), [["temp", true]])
    for (let i = 0; i < 2500; i++) bus.publish("loxone/haus/in/temp", Value.number(i), loxone)
    bus.publish("loxone/haus/in/door", Value.number(1), loxone)
    const batches = () => sent.filter(m => m.type === "watch.values")
    assert.equal(batches().length, 2, "the initial batch and the first value; the rest waits for acks")
    for (let seq = 0; seq < 6; seq++) feed.ack(seq)
    assert.equal(batches().length, 5, "then batches of up to a thousand")
    assert.equal(batches().reduce((sum, m) => sum + (m.type === "watch.values" ? m.values.length : 0), 0), 2501, "every value of temp, none of door")
    // choosing door too resends the list with its current value
    choose(new SignalSelection("all"))
    mock.timers.tick(WatchFeed.TICK_MS)
    const last = sent.filter(m => m.type === "watch.signals").at(-1)
    assert.deepEqual(last?.type === "watch.signals" && last.signals.map(s => s.id), ["temp", "door"])
    await feed.dispose()
  })

  test("a plugin that lags far behind loses the oldest values, and is told how many", async () => {
    const { bus, deps } = setup(new SignalSelection("all"))
    const sent: HostMessage[] = []
    const feed = new WatchFeed("x", deps, message => sent.push(message))
    for (let i = 0; i < WatchFeed.MAX_QUEUE + 3 * WatchFeed.BATCH; i++) bus.publish("loxone/haus/in/temp", Value.number(i), loxone)
    for (let seq = 0; seq < 40; seq++) feed.ack(seq)
    const dropped = sent.flatMap(m => (m.type === "watch.values" && m.dropped ? [m.dropped] : []))
    assert.ok(dropped.length > 0 && dropped.every(n => n > 0))
    await feed.dispose()
  })

  test("drops are reported at most once a minute; a forced actuator's initial value is its command", async () => {
    const { bus, registry, deps } = setup(new SignalSelection("all"))
    registry.register({ id: "lamp", topic: "ha/home/actuator/lamp", label: "Lamp", direction: "target", valueType: "number", delivery: "command" })
    bus.force("ha/home/actuator/lamp", Value.number(40), { by: "david" })
    const sent: HostMessage[] = []
    const reports: string[] = []
    const feed = new WatchFeed("x", deps, message => sent.push(message), text => reports.push(text))
    const initial = sent.find(m => m.type === "watch.values")
    assert.deepEqual(initial?.type === "watch.values" && initial.values.map(v => [v.signalId, v.kind, v.forced, v.initial]), [["lamp", "command", true, true]])
    for (let i = 0; i < WatchFeed.MAX_QUEUE + 2 * WatchFeed.BATCH; i++) bus.publish("loxone/haus/in/temp", Value.number(i), loxone)
    mock.timers.tick(WatchFeed.TICK_MS)
    for (let i = 0; i < WatchFeed.MAX_QUEUE; i++) bus.publish("loxone/haus/in/temp", Value.number(-i), loxone)
    for (let t = 0; t < WatchFeed.REPORT_TICKS; t++) mock.timers.tick(WatchFeed.TICK_MS)
    assert.equal(reports.length, 2, "one report right away, the next a minute later")
    assert.match(reports[0]!, /dropped/)
    await feed.dispose()
  })
})

test("a running watching plugin gets values through its worker; one that doesn't declare it gets none", { timeout: 10_000 }, async () => {
  const registry = new SignalRegistry()
  const bus = new EventBus({ topicKinds: registry })
  registry.register({ id: "temp", topic: "loxone/haus/in/temp", label: "Temperature", direction: "source", valueType: "number", delivery: "state" })
  bus.publish("loxone/haus/in/temp", Value.number(20), loxone)
  const stored = new Map<string, unknown>()
  const manager = new PluginManager({
    bus, registry, transport: new FakePluginTransport().add("exporter.ts", ExporterPlugin),
    store: { load: () => ({}), set: (_id, key, value) => void stored.set(key, value), delete: () => {} },
    logs: { log: () => {} },
    watch: { bus, signals: registry, selection: () => new SignalSelection("all") }
  })
  const description = await PluginTestHost.describe(ExporterPlugin)
  const supervisor = manager.add({ id: "i1", plugin: "exporter", slug: "influx", label: "", config: {}, enabled: true }, { id: "exporter", name: "Exporter", entry: "exporter.ts", description })
  await supervisor.start()
  await settle()
  bus.force("loxone/haus/in/temp", Value.number(5), { by: "david" })
  await settle()
  assert.deepEqual(stored.get("got"), ["Temperature=20 (initial)", "Temperature=5 (forced)"])
  await manager.dispose()
})
