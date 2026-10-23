import assert from "node:assert/strict"
import { afterEach, describe, mock, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { FakeClock } from "../test-support/FakeClock.ts"
import type { BusMessage } from "./BusMessage.ts"
import { SystemClock } from "./Clock.ts"
import { BUS_ERROR_TOPIC, EventBus, type EventBusOptions } from "./EventBus.ts"
import { InMemoryForceStore, type ForceRecord } from "./ForceStore.ts"

const plugin = { source: { kind: "plugin" as const, id: "p" } }
const DAY = 24 * 60 * 60 * 1000

const setup = (options: EventBusOptions = {}) => {
  const bus = new EventBus({ clock: new FakeClock(), ...options })
  const delivered: BusMessage[] = []
  const tapped: BusMessage[] = []
  bus.subscribe("#", message => delivered.push(message))
  bus.tap(message => tapped.push(message))
  return { bus, delivered, tapped }
}

class FailingStore extends InMemoryForceStore {
  override save(record: ForceRecord): void {
    void record
    throw new Error("db down")
  }
}

describe("bus edge cases from the M2 review", () => {
  afterEach(() => mock.timers.reset())

  test("a failing force store neither throws to the publisher nor strands the queue", () => {
    const { bus, delivered } = setup({ forces: new FailingStore() })
    bus.subscribe("a/trigger", message => {
      bus.force("a/forced", Value.number(1), { by: "david" })
      bus.publish("a/after", Value.number(2), { ...plugin, cause: message })
    })
    assert.doesNotThrow(() => bus.publish("a/trigger", Value.number(0), plugin))
    assert.deepEqual(delivered.map(m => m.topic), ["a/trigger", "a/after", BUS_ERROR_TOPIC])
    assert.match(delivered.at(-1)!.text!, /processing force on a\/forced failed: db down/)
    assert.equal(bus.activeForces().length, 0, "nothing half-forced in memory")
  })

  test("a force longer than 24.8 days does not expire early", () => {
    mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 })
    const { bus, delivered } = setup({ clock: new SystemClock() })
    bus.force("a/x", Value.number(1), { by: "david", until: Date.now() + 30 * DAY })
    mock.timers.tick(25 * DAY)
    assert.equal(bus.activeForces().length, 1)
    mock.timers.tick(5 * DAY)
    assert.equal(bus.activeForces().length, 0)
    assert.equal(delivered.length, 1, "no real value to restore")
  })

  test("re-forcing replaces the force and its expiry; a manual release cancels the expiry", () => {
    mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 })
    const { bus, delivered, tapped } = setup({ clock: new SystemClock() })
    bus.force("a/x", Value.number(1), { by: "david", until: 1000 })
    bus.force("a/x", Value.number(2), { by: "david" })
    mock.timers.tick(2000)
    assert.deepEqual(bus.current("a/x")?.value, Value.number(2))
    bus.force("a/y", Value.number(1), { by: "david", until: 5000 })
    bus.release("a/y", "david")
    mock.timers.tick(5000)
    assert.equal(tapped.filter(m => m.kind === "release").length, 1)
    assert.equal(delivered.filter(m => m.topic === "a/x").length, 2)
  })

  test("a force must not expire in the past", () => {
    const clock = new FakeClock()
    assert.throws(() => setup({ clock }).bus.force("a/x", Value.number(1), { by: "d", until: clock.now() }), RangeError)
  })

  test("releases carry the given source, even for a user called system", () => {
    const { bus, tapped } = setup()
    bus.force("a/x", Value.number(1), { by: "system" })
    bus.release("a/x", "system")
    assert.deepEqual(tapped.find(m => m.kind === "release")?.source, { kind: "user", id: "system" })
  })

  test("after releasing a topic without a real value, nothing stale remains", () => {
    const { bus, delivered } = setup()
    bus.force("a/x", Value.number(5), { by: "david" })
    bus.release("a/x", "david")
    assert.equal(bus.current("a/x"), undefined)
    bus.publish("a/x", Value.number(5), plugin)
    assert.deepEqual(delivered.at(-1)?.flags, undefined)
    assert.deepEqual(bus.pendingSnapshot().map(e => e.value), [Value.number(5)])
  })

  test("equal real publishes while forced are recorded once", () => {
    const { bus, tapped } = setup()
    bus.force("a/x", Value.number(0), { by: "david" })
    for (let i = 0; i < 5; i++) bus.publish("a/x", Value.number(3412), plugin)
    assert.equal(tapped.filter(m => m.flags?.shadowed).length, 1)
  })

  test("forced actuator topics deliver commands, before any command and after a restart", () => {
    const store = new InMemoryForceStore()
    const kinds = { kindOf: (topic: string) => (topic.includes("/actuator/") ? "command" as const : undefined) }
    const first = setup({ forces: store, topicKinds: kinds })
    first.bus.force("ha/z/actuator/light", Value.number(0), { by: "david" })
    assert.equal(first.delivered[0]!.kind, "command")
    const restarted = setup({ forces: store })
    restarted.bus.restoreForces()
    assert.equal(restarted.delivered[0]!.kind, "command", "the persisted kind is used without a resolver")
  })

  test("boot order: values restored under a force stay flagged restored when released", () => {
    const store = new InMemoryForceStore()
    setup({ forces: store }).bus.force("a/x", Value.number(0), { by: "david" })
    const { bus, delivered } = setup({ forces: store })
    bus.restoreForces()
    bus.restoreSnapshot([{ topic: "a/x", value: Value.number(42), ts: 1 }])
    assert.deepEqual(bus.pendingSnapshot(), [], "restored values are not dirty")
    bus.release("a/x", "david")
    assert.deepEqual([delivered.at(-1)?.value, delivered.at(-1)?.flags], [Value.number(42), { restored: true }])
  })

  test("a disposed bus ignores new messages", async () => {
    const { bus, delivered } = setup()
    await bus.dispose()
    bus.publish("a/x", Value.number(1), plugin)
    assert.equal(delivered.length, 0)
  })
})
