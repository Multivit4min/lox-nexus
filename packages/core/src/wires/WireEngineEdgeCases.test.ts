import assert from "node:assert/strict"
import { afterEach, describe, mock, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { BusMessage } from "../bus/BusMessage.ts"
import { EventBus } from "../bus/EventBus.ts"
import { WIRE_LOOP_TOPIC } from "./ActiveWire.ts"
import type { Signal } from "./Signal.ts"
import { SignalRegistry } from "./SignalRegistry.ts"
import { WireEngine } from "./WireEngine.ts"

const signal = (id: string, topic: string, direction: Signal["direction"], extra: Partial<Signal> = {}): Signal =>
  ({ id, topic, label: id, direction, valueType: "any", delivery: "state", ...extra })

const setup = (...signals: Signal[]) => {
  const registry = new SignalRegistry()
  signals.forEach(s => registry.register(s))
  const bus = new EventBus({ topicKinds: registry })
  const engine = new WireEngine(bus, registry)
  const seen: BusMessage[] = []
  bus.subscribe("#", message => seen.push(message))
  return { bus, engine, registry, seen }
}

describe("wire edge cases from the M2 review", () => {
  afterEach(() => mock.timers.reset())

  test("several plugin states caused by one command all reach Loxone (siblings are not loops)", () => {
    const { bus, engine, seen } = setup(
      signal("dimmer", "loxone/haus/in/dimmer", "source"),
      signal("ha-light", "ha/z/actuator/light", "target", { delivery: "command" }),
      signal("ha-state", "ha/z/sensor/light", "source"),
      signal("lox-out", "loxone/haus/out/light", "target"))
    engine.add({ id: "to-ha", label: "to HA", sourceId: "dimmer", targetId: "ha-light" })
    engine.add({ id: "to-lox", label: "to Loxone", sourceId: "ha-state", targetId: "lox-out" })
    bus.subscribe("ha/z/actuator/light", command => {
      for (const level of [10, 40, 80]) bus.publish("ha/z/sensor/light", Value.number(level), { source: { kind: "plugin", id: "ha" }, cause: command })
    })
    bus.publish("loxone/haus/in/dimmer", Value.number(80), { source: { kind: "loxone", id: "haus" } })
    const out = seen.filter(m => m.topic === "loxone/haus/out/light").map(m => m.value)
    assert.deepEqual(out, [Value.number(10), Value.number(40), Value.number(80)])
    assert.equal(seen.filter(m => m.topic === WIRE_LOOP_TOPIC).length, 0)
  })

  test("debounce through a wire forwards the latest value; removing the wire cancels it", () => {
    mock.timers.enable({ apis: ["setTimeout"] })
    const { bus, engine, seen } = setup(signal("a", "x/a", "source"), signal("b", "x/b", "target"))
    engine.add({ id: "w", label: "w", sourceId: "a", targetId: "b", transforms: [{ op: "debounce", ms: 100 }] })
    bus.subscribe("x/a", message => bus.publish("x/a", Value.number(2), { source: { kind: "user", id: "u" }, cause: message }))
    bus.publish("x/a", Value.number(1), { source: { kind: "user", id: "u" } })
    mock.timers.tick(100)
    assert.deepEqual(seen.filter(m => m.topic === "x/b").map(m => m.value), [Value.number(2)])
    bus.publish("x/a", Value.number(5), { source: { kind: "user", id: "u" } })
    engine.remove("w")
    mock.timers.tick(1000)
    assert.equal(seen.filter(m => m.topic === "x/b").length, 1)
  })

  test("unregistering a signal removes its wires", () => {
    const { engine, registry } = setup(signal("a", "x/a", "source"), signal("b", "x/b", "target"))
    engine.add({ id: "w", label: "w", sourceId: "a", targetId: "b" })
    registry.unregister("b")
    assert.deepEqual(engine.list(), [])
  })

  test("updating a signal's topic keeps its wires, now on the new topic", () => {
    const { bus, engine, registry, seen } = setup(signal("a", "x/old/a", "source"), signal("b", "x/out/b", "target"))
    engine.add({ id: "w", label: "w", sourceId: "a", targetId: "b" })
    registry.update(signal("a", "x/new/a", "source"))
    bus.publish("x/old/a", Value.number(1), { source: { kind: "system", id: "t" } })
    bus.publish("x/new/a", Value.number(2), { source: { kind: "system", id: "t" } })
    assert.deepEqual(seen.filter(m => m.topic === "x/out/b").map(m => m.value), [Value.number(2)])
    assert.deepEqual(engine.list().map(w => w.id), ["w"])
  })

  test("a wire that becomes invalid through an update is removed with an error event", () => {
    const { engine, registry, seen } = setup(signal("a", "x/a", "source"), signal("b", "x/b", "target"))
    engine.add({ id: "w", label: "w", sourceId: "a", targetId: "b" })
    registry.update(signal("b", "x/b", "source"))
    assert.deepEqual(engine.list(), [])
    assert.match(seen.find(m => m.topic === "system/wire/error")?.text ?? "", /"w" was removed: signal "b" is not a target/)
  })

  test("updating a signal onto another signal's topic is refused", () => {
    const { registry } = setup(signal("a", "x/a", "source"), signal("b", "x/b", "source"))
    assert.throws(() => registry.update(signal("a", "x/b", "source")), /already has a source signal/)
    assert.throws(() => registry.update(signal("zz", "x/z", "source")), /unknown signal/)
  })

  test("the registry tells the bus which topics carry commands", () => {
    const { registry } = setup(signal("a", "x/a", "source"), signal("b", "x/b", "target", { delivery: "command" }))
    assert.deepEqual([registry.kindOf("x/a"), registry.kindOf("x/b"), registry.kindOf("x/c")], ["state", "command", undefined])
  })

  test("delays are capped at one day", () => {
    const { engine } = setup(signal("a", "x/a", "source"), signal("b", "x/b", "target"))
    assert.throws(() => engine.add({ id: "w", label: "w", sourceId: "a", targetId: "b", transforms: [{ op: "throttle", ms: 30 * 86_400_000 }] }))
  })
})
