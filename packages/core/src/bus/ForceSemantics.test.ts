import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, mock, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { FakeClock } from "../test-support/FakeClock.ts"
import type { BusMessage } from "./BusMessage.ts"
import { EventBus } from "./EventBus.ts"
import { InMemoryForceStore } from "./ForceStore.ts"

const topic = "loxone/haus/out/pv-leistung"
const plugin = { source: { kind: "plugin" as const, id: "fronius" } }

const setup = (store = new InMemoryForceStore(), clock = new FakeClock()) => {
  const bus = new EventBus({ forces: store, clock })
  const delivered: BusMessage[] = []
  const tapped: BusMessage[] = []
  bus.subscribe("#", message => delivered.push(message))
  bus.tap(message => tapped.push(message))
  return { bus, delivered, tapped, store, clock }
}

describe("forces", () => {
  beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }))
  afterEach(() => mock.timers.reset())

  test("subscribers see the forced value; real publishes are shadowed", () => {
    const { bus, delivered, tapped } = setup()
    bus.publish(topic, Value.number(3412), plugin)
    bus.force(topic, Value.number(0), { by: "david", reason: "maintenance" })
    bus.publish(topic, Value.number(3500), plugin)
    assert.deepEqual(delivered.map(m => [m.value, m.flags]), [[Value.number(3412), undefined], [Value.number(0), { forced: true }]])
    assert.deepEqual(bus.current(topic)?.value, Value.number(0))
    const shadowed = tapped.find(m => m.flags?.shadowed)
    assert.deepEqual(shadowed?.value, Value.number(3500))
    assert.deepEqual(tapped.map(m => m.kind), ["state", "force", "state", "state"])
  })

  test("release restores the last real value, including ones shadowed meanwhile", () => {
    const { bus, delivered } = setup()
    bus.publish(topic, Value.number(1), plugin)
    bus.force(topic, Value.number(0), { by: "david" })
    bus.publish(topic, Value.number(2), plugin)
    bus.release(topic, "david")
    const last = delivered.at(-1)!
    assert.deepEqual([last.value, last.flags], [Value.number(2), undefined])
    assert.equal(bus.activeForces().length, 0)
  })

  test("release without any real value delivers nothing; unknown releases are ignored", () => {
    const { bus, delivered } = setup()
    bus.force(topic, Value.number(5), { by: "david" })
    bus.release(topic, "david")
    bus.release(topic, "david")
    assert.equal(delivered.length, 1)
  })

  test("until releases automatically", () => {
    const { bus, delivered, clock, tapped } = setup()
    bus.publish(topic, Value.number(1), plugin)
    bus.force(topic, Value.number(0), { by: "david", until: clock.now() + 60_000 })
    clock.advance(60_000)
    mock.timers.tick(60_000)
    assert.deepEqual(delivered.at(-1)?.value, Value.number(1))
    assert.equal(tapped.find(m => m.kind === "release")?.text, "expired")
  })

  test("forces survive a restart; expired ones are dropped", async () => {
    const { bus, store, clock } = setup()
    bus.force(topic, Value.number(0), { by: "david" })
    bus.force("a/expiring", Value.number(1), { by: "david", until: clock.now() + 1000 })
    await bus.dispose()
    clock.advance(5000)
    const restarted = setup(store, clock)
    restarted.bus.restoreForces()
    assert.deepEqual(restarted.delivered.map(m => [m.topic, m.value, m.flags]), [[topic, Value.number(0), { restored: true, forced: true }]])
    assert.deepEqual(store.load().map(r => r.topic), [topic])
  })

  test("forcing a command topic sends the forced command and shadows real commands", () => {
    const { bus, delivered } = setup()
    const actuator = "homeassistant/zuhause/actuator/light"
    bus.command(actuator, Value.number(10), plugin)
    bus.force(actuator, Value.number(0), { by: "david" })
    bus.command(actuator, Value.number(20), plugin)
    assert.deepEqual(delivered.map(m => [m.kind, m.value]), [["command", Value.number(10)], ["command", Value.number(0)]])
  })
})
