import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import { EventBus, SignalRegistry, WireEngine } from "@lox-nexus/core"
import { DataType } from "@lox-nexus/ici"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { Miniserver } from "./Miniserver.ts"
import { MiniserverManager } from "./MiniserverManager.ts"
import { BusProbe } from "./test-support/BusProbe.ts"
import { FakeMiniserver } from "./test-support/FakeMiniserver.ts"

const nextMessage = BusProbe.next

describe("Miniserver against a fake Miniserver on loopback", { timeout: 10_000 }, () => {
  const signals = new SignalRegistry()
  const bus = new EventBus({ topicKinds: signals })
  const wires = new WireEngine(bus, signals)
  const manager = new MiniserverManager({ bus, signals })
  const fake = new FakeMiniserver()
  let miniserver: Miniserver

  before(async () => {
    const fakePort = await fake.start()
    miniserver = manager.add({
      id: "ms1", slug: "haus", label: "Haus", host: "127.0.0.1", port: fakePort, listenPort: 0, listenAddress: "127.0.0.1",
      ownId: "claude", remoteId: "server", resendInterval: 0
    })
    miniserver.addSignal({ id: "rand", packetId: "rand", direction: "in", dataType: DataType.Analog, label: "Random" })
    miniserver.addSignal({ id: "even", packetId: "even", direction: "in", dataType: DataType.Digital, label: "Even" })
    miniserver.addSignal({ id: "moodin", packetId: "moodin", direction: "out", dataType: DataType.Analog, label: "Mood" })
    miniserver.addSignal({ id: "lamp", packetId: "lamp", direction: "out", dataType: DataType.SmartRgbw, label: "Lamp" })
    const online = nextMessage(bus, "system/loxone/haus/status", BusProbe.isString("waiting"))
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
    // the receiver already saw 7, so this resend is "unchanged" for it; it must still arrive
    const adopted = nextMessage(bus, "loxone/haus/in/newone")
    await fake.resend("newone", DataType.Analog)
    assert.deepEqual((await adopted).value, Value.number(7))
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

  test("forcing an out topic sends the forced value; real values wait for the release", async () => {
    const forced = fake.received("moodin")
    bus.force("loxone/haus/out/moodin", Value.number(69), { by: "test" })
    assert.equal((await forced).value, 69)
    const next = fake.received("moodin")
    bus.publish("loxone/haus/out/moodin", Value.number(70), { source: { kind: "user", id: "test" } })
    bus.force("loxone/haus/out/moodin", Value.number(71), { by: "test" })
    assert.equal((await next).value, 71, "the shadowed 70 was not sent")
    const restored = fake.received("moodin")
    bus.release("loxone/haus/out/moodin", "test")
    assert.equal((await restored).value, 70, "the release sends the last real value")
  })

  test("status heartbeats count only from the Miniserver itself", async () => {
    await miniserver.stop()
    await miniserver.start()
    fake.connect(miniserver.listenPort!)
    await fake.sendRaw(FakeMiniserver.STATUS_FROM_OTHER)
    const online = nextMessage(bus, "system/loxone/haus/status")
    await fake.sendRaw(FakeMiniserver.STATUS_FROM_SERVER)
    assert.deepEqual((await online).value, Value.string("online"), "the foreign heartbeat changed nothing")
  })

  test("a data type that differs from the configuration is reported", async () => {
    const problem = nextMessage(bus, "system/loxone/haus/error")
    await fake.send("rand", DataType.Text, "12")
    assert.match((await problem).text ?? "", /rand arrives as string but is configured as number/)
  })
})

describe("MiniserverManager", { timeout: 10_000 }, () => {
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
