import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import { EventBus, SignalRegistry, WireEngine, type BusMessage } from "@lox-nexus/core"
import { DataType } from "@lox-nexus/ici"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { Miniserver } from "./Miniserver.ts"
import { MiniserverManager } from "./MiniserverManager.ts"
import { FakeMiniserver } from "./test-support/FakeMiniserver.ts"

const nextMessage = (bus: EventBus, topic: string, predicate: (m: BusMessage) => boolean = () => true) =>
  new Promise<BusMessage>(resolve => {
    const subscription = bus.subscribe(topic, message => {
      if (!predicate(message)) return
      subscription.dispose()
      resolve(message)
    })
  })

describe("Miniserver against a fake Miniserver on loopback", () => {
  const signals = new SignalRegistry()
  const bus = new EventBus({ topicKinds: signals })
  const wires = new WireEngine(bus, signals)
  const manager = new MiniserverManager({ bus, signals })
  const fake = new FakeMiniserver()
  let miniserver: Miniserver

  before(async () => {
    const fakePort = await fake.start()
    miniserver = manager.add({
      id: "ms1", slug: "haus", label: "Haus", host: "127.0.0.1", port: fakePort, listenPort: 0,
      ownId: "claude", remoteId: "server", resendInterval: 0
    })
    miniserver.addSignal({ id: "rand", packetId: "rand", direction: "in", dataType: DataType.Analog, label: "Random" })
    miniserver.addSignal({ id: "even", packetId: "even", direction: "in", dataType: DataType.Digital, label: "Even" })
    miniserver.addSignal({ id: "moodin", packetId: "moodin", direction: "out", dataType: DataType.Analog, label: "Mood" })
    miniserver.addSignal({ id: "lamp", packetId: "lamp", direction: "out", dataType: DataType.SmartRgbw, label: "Lamp" })
    const online = nextMessage(bus, "system/loxone/haus/status", m => m.value?.type === "string" && m.value.value === "waiting")
    await miniserver.start()
    await online
    fake.connect(miniserver.listenPort!)
  })

  after(async () => {
    await wires.dispose()
    await manager.dispose()
    await fake.stop()
  })

  test("a packet from the Miniserver becomes a typed bus state and marks it online", async () => {
    const arrived = nextMessage(bus, "loxone/haus/in/rand")
    const online = nextMessage(bus, "system/loxone/haus/status")
    await fake.send("rand", DataType.Analog, 42)
    const message = await arrived
    assert.deepEqual([message.value, message.source.kind], [Value.number(42), "loxone"])
    assert.deepEqual((await online).value, Value.string("online"))
  })

  test("a wrong data type is converted to the signal's type", async () => {
    const arrived = nextMessage(bus, "loxone/haus/in/even")
    await fake.send("even", DataType.Analog, 1)
    assert.deepEqual((await arrived).value, Value.boolean(true))
  })

  test("unknown packet ids are discovered and can be adopted", async () => {
    const discovered = nextMessage(bus, "loxone/haus/discovered/newone")
    await fake.send("newone", DataType.Analog, 7)
    assert.deepEqual((await discovered).value, Value.number(7))
    assert.deepEqual(miniserver.discovery.list().map(d => d.packetId), ["newone"])
    miniserver.addSignal({ id: "newone", packetId: "newone", direction: "in", dataType: DataType.Analog, label: "New" })
    assert.deepEqual(miniserver.discovery.list(), [])
    const adopted = nextMessage(bus, "loxone/haus/in/newone")
    await fake.send("newone", DataType.Analog, 8)
    assert.deepEqual((await adopted).value, Value.number(8))
  })

  test("a value on an out topic is sent to the Miniserver, converted to its data type", async () => {
    const received = fake.received("lamp")
    bus.publish("loxone/haus/out/lamp", Value.number(80), { source: { kind: "user", id: "test" } })
    const event = await received
    assert.deepEqual([event.packet.dataType, event.value], [DataType.SmartRgbw, { red: 0, green: 0, blue: 0, white: 80, fadeTime: 0.2, flags: 0 }])
  })

  test("packet → bus → wire → packet", async () => {
    wires.add({ id: "w", label: "rand to mood", sourceId: "rand", targetId: "moodin" })
    const received = fake.received("moodin")
    await fake.send("rand", DataType.Analog, 51)
    assert.equal((await received).value, 51)
    wires.remove("w")
  })

  test("forcing an out topic sends the forced value to the Miniserver", async () => {
    const received = fake.received("moodin")
    bus.force("loxone/haus/out/moodin", Value.number(69), { by: "test" })
    assert.equal((await received).value, 69)
    bus.release("loxone/haus/out/moodin", "test")
  })
})

describe("MiniserverManager", () => {
  test("a taken listen port fails only that Miniserver", async () => {
    const signals = new SignalRegistry()
    const manager = new MiniserverManager({ bus: new EventBus(), signals })
    const base = { label: "", host: "127.0.0.1", port: 1, ownId: "claude", remoteId: "server" }
    const first = manager.add({ ...base, id: "a", slug: "a", listenPort: 0 })
    await first.start()
    manager.add({ ...base, id: "b", slug: "b", listenPort: first.listenPort! })
    const failures = await manager.startEnabled()
    assert.deepEqual(failures.map(f => [f.id, (f.error as NodeJS.ErrnoException).code]), [["b", "EADDRINUSE"]])
    assert.equal(manager.get("b")!.isRunning, false)
    assert.throws(() => manager.add({ ...base, id: "c", slug: "a", listenPort: 0 }), /slug "a"/)
    await manager.dispose()
  })

  test("removing a Miniserver unregisters its signals", async () => {
    const signals = new SignalRegistry()
    const manager = new MiniserverManager({ bus: new EventBus(), signals })
    const miniserver = manager.add({ id: "a", slug: "a", label: "", host: "127.0.0.1", port: 1, listenPort: 0, ownId: "claude", remoteId: "server" })
    miniserver.addSignal({ id: "x", packetId: "x", direction: "in", dataType: DataType.Digital, label: "x" })
    assert.equal(signals.list().length, 1)
    await manager.remove("a")
    assert.equal(signals.list().length, 0)
  })
})
