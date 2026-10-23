import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { FakeClock } from "../test-support/FakeClock.ts"
import { EventBus } from "./EventBus.ts"
import { MessageFormatter } from "./MessageFormatter.ts"
import { Recorder } from "./Recorder.ts"

const loxone = { source: { kind: "loxone" as const, id: "haus", label: "Miniserver Haus" } }

describe("Recorder", () => {
  test("rebuilds the cause chain as a tree", () => {
    const bus = new EventBus()
    const recorder = new Recorder(bus)
    bus.subscribe("a/in", message => {
      bus.command("a/out1", Value.number(1), { source: { kind: "wire", id: "w1" }, cause: message })
      bus.command("a/out2", Value.number(2), { source: { kind: "wire", id: "w2" }, cause: message })
    })
    // only commands get a result; reacting to the result itself would loop forever
    bus.subscribe("a/out1", message => {
      if (message.kind === "command") bus.result("a/out1", { ok: true, durationMs: 5 }, { source: { kind: "plugin", id: "p" }, cause: message })
    })
    bus.publish("a/in", Value.number(0), loxone)
    const leaf = recorder.recent(1)[0]!
    const tree = recorder.trace(leaf.id)!
    assert.equal(tree.message.topic, "a/in")
    assert.deepEqual(tree.children.map(c => c.message.topic), ["a/out1", "a/out2"])
    assert.equal(tree.children[0]!.children[0]!.message.kind, "result")
  })

  test("evicts the oldest messages beyond capacity and filters by pattern", () => {
    const bus = new EventBus()
    const recorder = new Recorder(bus, 3)
    for (let i = 0; i < 5; i++) bus.publish(`a/${i % 2 ? "odd" : "even"}`, Value.number(i), loxone)
    assert.equal(recorder.size, 3)
    assert.deepEqual(recorder.recent(10, "a/even").map(m => m.value), [Value.number(2), Value.number(4)])
  })
})

describe("MessageFormatter", () => {
  test("renders one readable line per message kind", () => {
    const clock = new FakeClock()
    const bus = new EventBus({ clock })
    const lines: string[] = []
    const formatter = new MessageFormatter({ utc: true, topicWidth: 30 })
    bus.tap(message => lines.push(formatter.format(message)))
    const wire = { source: { kind: "wire" as const, id: "w1", label: "Küche Dimmer → Licht" } }
    bus.subscribe("loxone/haus/in/dimmer", message => bus.command("ha/z/actuator/light", Value.number(42), { ...wire, cause: message }))
    bus.publish("loxone/haus/in/dimmer", Value.number(42), loxone)
    bus.result("ha/z/actuator/light", { ok: true, durationMs: 59 }, { source: { kind: "plugin", id: "ha" } })
    bus.force("loxone/haus/out/pv", Value.number(0), { by: "david", reason: "maintenance" })
    bus.publish("loxone/haus/out/pv", Value.number(3412), { source: { kind: "plugin", id: "fronius" } })
    bus.release("loxone/haus/out/pv", "david")
    assert.deepEqual(lines, [
      "12:04:31.120  loxone/haus/in/dimmer           42  ← loxone Miniserver Haus",
      "12:04:31.120  ha/z/actuator/light             ▶ 42  ← wire Küche Dimmer → Licht",
      "12:04:31.120  ha/z/actuator/light             ✓ 59 ms  ← plugin ha",
      "12:04:31.120  loxone/haus/out/pv              🔒 force 0 (by david: \"maintenance\")  ← user david",
      "12:04:31.120  loxone/haus/out/pv              🔒 0  ← user david",
      "12:04:31.120  loxone/haus/out/pv              (shadowed) 3412  ← plugin fronius",
      "12:04:31.120  loxone/haus/out/pv              🔓 released  ← user david",
      "12:04:31.120  loxone/haus/out/pv              3412  ← plugin fronius"
    ])
  })
})
