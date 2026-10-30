import assert from "node:assert/strict"
import { test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { FakeClock } from "../test-support/FakeClock.ts"
import { EventBus } from "./EventBus.ts"

const loxone = { source: { kind: "loxone" as const, id: "haus" } }

test("lastSeen counts repeats the bus drops, also while forced, but not restored values or commands", () => {
  const clock = new FakeClock()
  const bus = new EventBus({ clock })
  const topic = "loxone/haus/in/temp"
  bus.restoreSnapshot([{ topic, value: Value.number(20), ts: 0 }])
  assert.equal(bus.lastSeen(topic), undefined, "a value from before the restart proves nothing")
  clock.advance(1000)
  bus.publish(topic, Value.number(21), loxone)
  const first = clock.now()
  clock.advance(10_000)
  bus.publish(topic, Value.number(21), loxone)
  assert.equal(bus.lastSeen(topic), first + 10_000, "an equal resend is dropped but counts")
  bus.force(topic, Value.number(5), { by: "test" })
  clock.advance(10_000)
  bus.publish(topic, Value.number(21), loxone)
  assert.equal(bus.lastSeen(topic), first + 20_000, "the source still talks while forced")
  bus.command("plugin/x/actuator/set", Value.number(1), loxone)
  assert.equal(bus.lastSeen("plugin/x/actuator/set"), undefined)
})
