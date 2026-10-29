import assert from "node:assert/strict"
import { test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { EventBus } from "./EventBus.ts"

const user = { source: { kind: "user" as const, id: "t" } }

test("the last delivered command is kept for display, never as the current value", () => {
  const bus = new EventBus()
  bus.command("p/x/actuator/light", Value.boolean(true), user)
  assert.deepEqual(bus.lastCommand("p/x/actuator/light")?.value, Value.boolean(true))
  assert.equal(bus.current("p/x/actuator/light"), undefined)
  assert.deepEqual(bus.lastCommandsMatching("p/#").map(m => m.topic), ["p/x/actuator/light"])
})

test("a forced command counts as sent; commands shadowed by the force don't; the release keeps the forced value, unflagged", () => {
  const bus = new EventBus()
  bus.command("a", Value.number(1), user)
  bus.force("a", Value.number(20), { by: "t", kind: "command" })
  assert.deepEqual([bus.lastCommand("a")?.value, bus.lastCommand("a")?.flags?.forced], [Value.number(20), undefined])
  bus.command("a", Value.number(2), user)
  bus.release("a", "t")
  assert.deepEqual(bus.lastCommand("a")?.value, Value.number(20))
})

test("forget drops the last command of a deleted signal, but not of a forced one", () => {
  const bus = new EventBus()
  bus.command("a/one", Value.number(1), user)
  bus.force("a/two", Value.number(2), { by: "t", kind: "command" })
  bus.forget("a/#")
  assert.equal(bus.lastCommand("a/one"), undefined)
  assert.deepEqual(bus.lastCommand("a/two")?.value, Value.number(2))
})
