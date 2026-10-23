import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { FakeClock } from "../test-support/FakeClock.ts"
import type { BusMessage } from "./BusMessage.ts"
import { BUS_ERROR_TOPIC, EventBus } from "./EventBus.ts"

const loxone = { source: { kind: "loxone" as const, id: "haus" } }
const collect = (bus: EventBus, pattern = "#") => {
  const seen: BusMessage[] = []
  bus.subscribe(pattern, message => seen.push(message))
  return seen
}

describe("EventBus delivery", () => {
  test("delivers states to matching subscribers and dedups equal values", () => {
    const bus = new EventBus({ clock: new FakeClock() })
    const seen = collect(bus, "loxone/+/in/#")
    bus.publish("loxone/haus/in/rand", Value.number(1), loxone)
    bus.publish("loxone/haus/in/rand", Value.number(1), loxone)
    bus.publish("loxone/haus/in/rand", Value.number(2), loxone)
    bus.publish("loxone/haus/out/x", Value.number(9), loxone)
    assert.deepEqual(seen.map(m => m.value), [Value.number(1), Value.number(2)])
    assert.deepEqual(bus.current("loxone/haus/in/rand")?.value, Value.number(2))
  })

  test("never dedups commands, so pulses work", () => {
    const bus = new EventBus()
    const seen = collect(bus)
    bus.command("ha/x/actuator/button", Value.boolean(true), loxone)
    bus.command("ha/x/actuator/button", Value.boolean(true), loxone)
    assert.equal(seen.length, 2)
  })

  test("force option delivers an equal value again", () => {
    const bus = new EventBus()
    const seen = collect(bus)
    bus.publish("a/b", Value.number(1), loxone)
    bus.publish("a/b", Value.number(1), { ...loxone, force: true })
    assert.equal(seen.length, 2)
  })

  test("effects run after their cause has reached every subscriber (FIFO, no re-entry)", () => {
    const bus = new EventBus()
    const order: string[] = []
    bus.subscribe("a/x", message => {
      order.push("first:a/x")
      bus.publish("a/y", Value.number(1), { ...loxone, cause: message })
    })
    bus.subscribe("a/x", () => order.push("second:a/x"))
    bus.subscribe("a/y", () => order.push("a/y"))
    bus.publish("a/x", Value.number(1), loxone)
    assert.deepEqual(order, ["first:a/x", "second:a/x", "a/y"])
  })

  test("causation links id, causedBy, traceId and depth", () => {
    const bus = new EventBus()
    const seen = collect(bus)
    bus.subscribe("a/x", message => bus.command("a/y", Value.number(2), { ...loxone, cause: message }))
    bus.publish("a/x", Value.number(1), loxone)
    const [root, effect] = seen
    assert.equal(effect!.causedBy, root!.id)
    assert.equal(effect!.traceId, root!.id)
    assert.deepEqual([root!.depth, effect!.depth], [0, 1])
    assert.ok(effect!.seq > root!.seq)
  })

  test("a throwing handler becomes a bus error event, never an exception", () => {
    const bus = new EventBus()
    const errors = collect(bus, BUS_ERROR_TOPIC)
    bus.subscribe("a/x", () => { throw new Error("boom") })
    assert.doesNotThrow(() => bus.publish("a/x", Value.number(1), loxone))
    assert.match(errors[0]!.text!, /handler for a\/x failed: boom/)
    assert.ok(errors[0]!.causedBy)
  })

  test("rejects invalid topics", () => {
    assert.throws(() => new EventBus().publish("Bad Topic", Value.null(), loxone), RangeError)
  })

  test("snapshots contain real values and restore as flagged messages", () => {
    const bus = new EventBus()
    bus.publish("a/x", Value.number(1), loxone)
    const snapshot = bus.takeSnapshot()
    assert.deepEqual(snapshot.map(e => [e.topic, e.value]), [["a/x", Value.number(1)]])
    assert.deepEqual(bus.takeSnapshot(), [])
    const restarted = new EventBus()
    const seen = collect(restarted)
    restarted.restoreSnapshot(snapshot)
    assert.deepEqual(seen[0]!.flags, { restored: true })
  })
})
