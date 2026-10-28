import assert from "node:assert/strict"
import { test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { EventBus } from "../bus/EventBus.ts"
import type { Signal } from "../wires/Signal.ts"
import { SignalRegistry } from "../wires/SignalRegistry.ts"
import { SelectedValues } from "./SelectedValues.ts"
import { SignalSelection } from "./SignalSelection.ts"

const source = { source: { kind: "loxone" as const, id: "haus" } }
const signal = (id: string, topic: string, direction: Signal["direction"], delivery: Signal["delivery"] = "state"): Signal =>
  ({ id, topic, label: id, direction, valueType: "number", delivery, owner: { kind: "miniserver", id: "haus" } })

function setup(selection: SignalSelection) {
  const registry = new SignalRegistry()
  const bus = new EventBus({ topicKinds: registry })
  const seen: string[] = []
  let current = selection
  const values = new SelectedValues(bus, registry, () => current, (s, message) => seen.push(`${s.id} ${message.kind} ${JSON.stringify(message.value)}${message.flags?.forced ? " forced" : ""}`))
  return { registry, bus, seen, values, select: (next: SignalSelection) => (current = next) }
}

test("passes states and commands of selected signals, as subscribers see them", async () => {
  const { registry, bus, seen, values } = setup(new SignalSelection("selected", [{ target: { signalId: "temp" }, include: true }, { target: { signalId: "lamp" }, include: true }]))
  registry.register(signal("temp", "loxone/haus/in/temp", "source"))
  registry.register(signal("lamp", "ha/home/actuator/lamp", "target", "command"))
  registry.register(signal("other", "loxone/haus/in/other", "source"))
  bus.publish("loxone/haus/in/temp", Value.number(21), source)
  bus.command("ha/home/actuator/lamp", Value.number(50), source)
  bus.publish("loxone/haus/in/other", Value.number(1), source)
  bus.publish("system/loxone/haus/load", Value.number(3), source)
  bus.force("loxone/haus/in/temp", Value.number(5), { by: "david" })
  bus.publish("loxone/haus/in/temp", Value.number(22), source)
  assert.deepEqual(seen, [
    "temp state {\"type\":\"number\",\"value\":21}",
    "lamp command {\"type\":\"number\",\"value\":50}",
    "temp state {\"type\":\"number\",\"value\":5} forced"
  ], "the shadowed 22 never passes")
  await values.dispose()
})

test("a changed selection and a new signal apply at once; the registry finds signals by topic", async () => {
  const { registry, bus, seen, values, select } = setup(SignalSelection.NONE)
  const added: string[] = []
  registry.on("registered", s => added.push(s.id))
  registry.register(signal("temp", "loxone/haus/in/temp", "source"))
  registry.register(signal("echo", "loxone/haus/in/temp", "target"))
  assert.deepEqual([added, registry.atTopic("loxone/haus/in/temp")?.id, registry.atTopic("nope")], [["temp", "echo"], "temp", undefined])
  bus.publish("loxone/haus/in/temp", Value.number(1), source)
  select(new SignalSelection("all"))
  bus.publish("loxone/haus/in/temp", Value.number(2), source)
  assert.deepEqual(seen, ["temp state {\"type\":\"number\",\"value\":2}"])
  await values.dispose()
  bus.publish("loxone/haus/in/temp", Value.number(3), source)
  assert.equal(seen.length, 1, "disposed: unsubscribed")
})

test("after a force is released, the real value passes as a change even when it came from the snapshot", async () => {
  const { registry, bus, seen, values } = setup(new SignalSelection("all"))
  registry.register(signal("temp", "loxone/haus/in/temp", "source"))
  bus.restoreSnapshot([{ topic: "loxone/haus/in/temp", value: Value.number(20), ts: 0 }])
  bus.force("loxone/haus/in/temp", Value.number(5), { by: "david" })
  bus.release("loxone/haus/in/temp", "david")
  const restored: boolean[] = []
  values.dispose()
  const again = new SelectedValues(bus, registry, () => new SignalSelection("all"), (_s, message) => restored.push(message.flags?.restored === true))
  bus.restoreSnapshot([{ topic: "loxone/haus/in/temp", value: Value.number(21), ts: 1 }])
  assert.deepEqual(seen.slice(-2), ["temp state {\"type\":\"number\",\"value\":5} forced", "temp state {\"type\":\"number\",\"value\":20}"])
  assert.deepEqual(restored, [true], "a replay without a force before it stays a replay")
  await again.dispose()
})

