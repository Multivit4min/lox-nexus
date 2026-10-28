import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { BusMessage } from "../bus/BusMessage.ts"
import { EventBus } from "../bus/EventBus.ts"
import { WIRE_LOOP_TOPIC } from "./ActiveWire.ts"
import type { Signal } from "./Signal.ts"
import { SignalRegistry } from "./SignalRegistry.ts"
import { WireEngine } from "./WireEngine.ts"

const loxone = { source: { kind: "loxone" as const, id: "haus" } }
const signal = (id: string, topic: string, direction: Signal["direction"], extra: Partial<Signal> = {}): Signal =>
  ({ id, topic, label: id, direction, valueType: "any", delivery: "state", ...extra })

const setup = (...signals: Signal[]) => {
  const bus = new EventBus()
  const registry = new SignalRegistry()
  signals.forEach(s => registry.register(s))
  const engine = new WireEngine(bus, registry)
  const seen: BusMessage[] = []
  bus.subscribe("#", message => seen.push(message))
  return { bus, engine, seen }
}

describe("WireEngine", () => {
  test("forwards source values to the target, converted to its type, with causation", () => {
    const { bus, engine, seen } = setup(
      signal("dimmer", "loxone/haus/in/dimmer", "source"),
      signal("light", "ha/z/actuator/light", "target", { valueType: "singleChannel", delivery: "command" }))
    engine.add({ id: "w1", label: "Dimmer → Licht", sourceId: "dimmer", targetId: "light" })
    bus.publish("loxone/haus/in/dimmer", Value.number(42), loxone)
    const [input, output] = seen
    assert.equal(output!.kind, "command")
    assert.deepEqual(output!.value, Value.singleChannel({ channel: 42, fadeTime: 0.2 }))
    assert.deepEqual([output!.source, output!.causedBy], [{ kind: "wire", id: "w1", label: "Dimmer → Licht" }, input!.id])
  })

  test("ignores restored values unless syncOnStart", () => {
    const { bus, engine, seen } = setup(
      signal("a", "x/a", "source"), signal("b", "x/b", "target"), signal("c", "x/c", "source"), signal("d", "x/d", "target"))
    engine.add({ id: "live", label: "live", sourceId: "a", targetId: "b" })
    engine.add({ id: "sync", label: "sync", sourceId: "c", targetId: "d", syncOnStart: true })
    bus.restoreSnapshot([{ topic: "x/a", value: Value.number(1), ts: 0 }, { topic: "x/c", value: Value.number(1), ts: 0 }])
    assert.deepEqual(seen.map(m => m.topic), ["x/a", "x/c", "x/d"])
  })

  test("a forced source reaches the target", () => {
    const { bus, engine, seen } = setup(signal("a", "x/a", "source"), signal("b", "x/b", "target"))
    engine.add({ id: "w", label: "w", sourceId: "a", targetId: "b" })
    bus.force("x/a", Value.number(7), { by: "david" })
    assert.deepEqual(seen.at(-1)?.value, Value.number(7))
  })

  test("drops a loop inside the bus and reports it (one firing per wire per trace)", () => {
    const { bus, engine, seen } = setup(
      signal("a-in", "t/a", "source"), signal("b-out", "t/b", "target"),
      signal("b-in", "t/b", "source"), signal("a-out", "t/a", "target"))
    engine.add({ id: "forth", label: "forth", sourceId: "a-in", targetId: "b-out", transforms: [{ op: "invert" }] })
    engine.add({ id: "back", label: "back", sourceId: "b-in", targetId: "a-out" })
    bus.publish("t/a", Value.boolean(true), loxone)
    assert.deepEqual(seen.map(m => [m.topic, m.value?.type === "boolean" ? m.value.value : m.kind]),
      [["t/a", true], ["t/b", false], ["t/a", false], [WIRE_LOOP_TOPIC, "event"]])
  })

  test("validates wires: unknown signals, directions, one wire per target, transform config", () => {
    const { engine } = setup(signal("a", "x/a", "source"), signal("b", "x/b", "target"), signal("c", "x/c", "source"))
    engine.add({ id: "w1", label: "", sourceId: "a", targetId: "b" })
    assert.throws(() => engine.add({ id: "w2", label: "", sourceId: "c", targetId: "b" }), /"b" is already fed by wire "w1"/)
    assert.throws(() => engine.add({ id: "w3", label: "", sourceId: "b", targetId: "a" }), /not a source/)
    assert.throws(() => engine.add({ id: "w4", label: "", sourceId: "nope", targetId: "b" }), /source signal "nope" does not exist/)
    assert.throws(() => engine.add({ id: "w5", label: "", sourceId: "c", targetId: "b", transforms: [{ op: "debounce", ms: -1 }] }))
  })

  test("problem() explains what add() would refuse, without starting anything", () => {
    const { engine } = setup(signal("a", "x/a", "source"), signal("b", "x/b", "target"), signal("c", "x/c", "source"))
    engine.add({ id: "w1", label: "first", sourceId: "a", targetId: "b" })
    assert.equal(engine.problem({ id: "w1", label: "first", sourceId: "c", targetId: "b" }), undefined, "its own running wire doesn't count")
    assert.match(engine.problem({ id: "w2", label: "", sourceId: "c", targetId: "b" }) ?? "", /already fed by wire "first"/)
    assert.match(engine.problem({ id: "w2", label: "", sourceId: "a", targetId: "gone" }) ?? "", /target signal "gone" does not exist/)
    assert.match(engine.problem({ id: "w2", label: "", sourceId: "a", targetId: "c" }) ?? "", /"c" is not a target/)
    assert.match(engine.problem({ id: "w2", label: "", sourceId: "a", targetId: "b", transforms: [{ op: "debounce", ms: 0 }] }) ?? "", /^transforms\.0\.ms: /)
    assert.deepEqual(engine.list().map(wire => wire.id), ["w1"])
  })

  test("removing a wire stops forwarding", () => {
    const { bus, engine, seen } = setup(signal("a", "x/a", "source"), signal("b", "x/b", "target"))
    engine.add({ id: "w", label: "w", sourceId: "a", targetId: "b" })
    engine.remove("w")
    bus.publish("x/a", Value.number(1), loxone)
    assert.deepEqual(seen.map(m => m.topic), ["x/a"])
  })
  test("sync() delivers the source's current value once, under the same rules as a publish", () => {
    const { bus, engine, seen } = setup(
      signal("a", "x/a", "source"), signal("b", "x/b", "target"), signal("c", "x/c", "source"), signal("d", "x/d", "target"))
    bus.publish("x/a", Value.number(3), loxone)
    bus.restoreSnapshot([{ topic: "x/c", value: Value.number(1), ts: 0 }])
    engine.add({ id: "w", label: "w", sourceId: "a", targetId: "b" })
    engine.add({ id: "restored", label: "restored", sourceId: "c", targetId: "d" })
    assert.deepEqual(seen.map(m => m.topic), ["x/a", "x/c"], "adding a wire alone delivers nothing")
    assert.equal(engine.sync("w"), true)
    assert.equal(engine.sync("restored"), true)
    assert.equal(engine.sync("nope"), false)
    // a restored value stays put without syncOnStart, as it would at boot
    assert.deepEqual(seen.map(m => [m.topic, m.value]), [["x/a", Value.number(3)], ["x/c", Value.number(1)], ["x/b", Value.number(3)]])
    assert.equal(seen.at(-1)?.causedBy, seen[0]!.id)
    engine.sync("restored", { restored: true })
    assert.equal(seen.at(-1)?.topic, "x/d", "unless asked for")
  })
  test("sync() sends nothing over a disabled wire, and a forced source's forced value", () => {
    const { bus, engine, seen } = setup(signal("a", "x/a", "source"), signal("b", "x/b", "target"), signal("c", "x/c", "target"))
    bus.publish("x/a", Value.number(1), loxone)
    bus.force("x/a", Value.number(9), { by: "david" })
    engine.add({ id: "off", label: "off", sourceId: "a", targetId: "b", enabled: false })
    engine.add({ id: "on", label: "on", sourceId: "a", targetId: "c" })
    const before = seen.length
    engine.sync("off")
    engine.sync("on")
    assert.deepEqual(seen.slice(before).map(m => [m.topic, m.value]), [["x/c", Value.number(9)]])
  })
})
