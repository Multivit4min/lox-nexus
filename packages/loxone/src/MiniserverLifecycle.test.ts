import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, test } from "node:test"
import { EventBus, SignalRegistry, WireEngine } from "@lox-nexus/core"
import { DataType, IciSocket } from "@lox-nexus/ici"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { MiniserverManager } from "./MiniserverManager.ts"
import { BusProbe } from "./test-support/BusProbe.ts"
import { FakeMiniserver } from "./test-support/FakeMiniserver.ts"

const user = { source: { kind: "user" as const, id: "test" } }
/** binds and releases the port; rejects with EADDRINUSE while something still holds it */
const bindOnce = async (port: number) => {
  const socket = new IciSocket()
  await socket.bind(port, "127.0.0.1")
  const bound = socket.address()!.port
  await socket.close()
  return bound
}

describe("Miniserver lifecycle (review findings)", { timeout: 10_000 }, () => {
  let signals: SignalRegistry
  let bus: EventBus
  let wires: WireEngine
  let manager: MiniserverManager
  let fake: FakeMiniserver
  let base: { label: string; host: string; port: number; listenPort: number; listenAddress: string; ownId: string; remoteId: string; resendInterval: number }

  beforeEach(async () => {
    signals = new SignalRegistry()
    bus = new EventBus({ topicKinds: signals })
    wires = new WireEngine(bus, signals)
    manager = new MiniserverManager({ bus, signals })
    fake = new FakeMiniserver()
    const port = await fake.start()
    base = { label: "Haus", host: "127.0.0.1", port, listenPort: 0, listenAddress: "127.0.0.1", ownId: "claude", remoteId: "server", resendInterval: 0 }
  })

  afterEach(async () => {
    await wires.dispose()
    await manager.dispose()
    await fake.stop()
  })

  test("a restart sends the current value of every output", async () => {
    const ms = manager.add({ ...base, id: "ms", slug: "haus" })
    ms.addSignal({ id: "out", packetId: "out", direction: "out", dataType: DataType.Analog, label: "" })
    bus.publish("loxone/haus/out/out", Value.number(9), user)
    const first = fake.received("out")
    await ms.start()
    assert.equal((await first).value, 9, "a value that existed before the start is sent")
    await ms.stop()
    const again = fake.received("out")
    await ms.start()
    assert.equal((await again).value, 9)
  })

  test("an output added while running gets the current value; a removed one is gone from the peer", async () => {
    const ms = manager.add({ ...base, id: "ms", slug: "haus" })
    await ms.start()
    bus.publish("loxone/haus/out/x", Value.number(3), user)
    const synced = fake.received("x")
    ms.addSignal({ id: "x", packetId: "x", direction: "out", dataType: DataType.Analog, label: "" })
    assert.equal((await synced).value, 3)
    ms.removeSignal("x")
    // the peer would refuse another data type for a packet id it still knew
    const retyped = fake.received("x")
    ms.addSignal({ id: "x2", packetId: "x", direction: "out", dataType: DataType.Text, label: "", slug: "x" })
    const event = await retyped
    assert.deepEqual([event.packet.dataType, event.value], [DataType.Text, "3"])
  })

  test("a packet id can have only one signal per direction", () => {
    const ms = manager.add({ ...base, id: "ms", slug: "haus" })
    ms.addSignal({ id: "a", packetId: "p", direction: "in", dataType: DataType.Analog, label: "" })
    assert.throws(() => ms.addSignal({ id: "b", packetId: "p", direction: "in", dataType: DataType.Analog, label: "", slug: "other" }), /already has an in signal/)
    ms.addSignal({ id: "c", packetId: "p", direction: "out", dataType: DataType.Analog, label: "" })
    assert.deepEqual(signals.list().map(s => s.id), ["a", "c"])
  })

  test("concurrent starts open one socket, and stop or remove during a start win", async () => {
    const listenPort = await bindOnce(0)
    const ms = manager.add({ ...base, id: "ms", slug: "haus", listenPort })
    await Promise.all([ms.start(), ms.start()])
    await ms.stop()
    const starting = ms.start()
    await ms.stop()
    await starting
    assert.equal(ms.isRunning, false, "the stop queued after the start ran last")
    const removedWhileStarting = ms.start()
    await manager.remove("ms")
    await removedWhileStarting
    assert.equal(ms.isRunning, false)
    assert.equal(await bindOnce(listenPort), listenPort, "no socket was left behind")
    await assert.rejects(ms.start(), /disposed/)
  })

  test("a failed start is kept as lastError and reported; a successful one clears it", async () => {
    const first = manager.add({ ...base, id: "a", slug: "a" })
    await first.start()
    const second = manager.add({ ...base, id: "b", slug: "b", listenPort: first.listenPort! })
    const reported = BusProbe.next(bus, "system/loxone/b/error")
    await assert.rejects(second.start())
    assert.match(second.lastError ?? "", /EADDRINUSE/)
    assert.match((await reported).text ?? "", /start failed: .*EADDRINUSE/)
    await manager.update("b", { ...second.config, listenPort: 0 })
    await second.start()
    assert.equal(second.lastError, undefined)
  })

  test("a new slug re-keys the topics and keeps the wires", async () => {
    const ms = manager.add({ ...base, id: "ms", slug: "haus" })
    ms.addSignal({ id: "in", packetId: "in", direction: "in", dataType: DataType.Analog, label: "" })
    ms.addSignal({ id: "out", packetId: "out", direction: "out", dataType: DataType.Analog, label: "" })
    wires.add({ id: "w", label: "in to out", sourceId: "in", targetId: "out" })
    await ms.start()
    await manager.update("ms", { ...ms.config, slug: "home" })
    assert.deepEqual(signals.list().map(s => s.topic), ["loxone/home/in/in", "loxone/home/out/out"])
    assert.equal(ms.isRunning, true, "it was running, so it was restarted")
    fake.connect(ms.listenPort!)
    const received = fake.received("out")
    await fake.send("in", DataType.Analog, 5)
    assert.equal((await received).value, 5)
  })

  test("shutdown keeps signals and wires; removing deletes them", async () => {
    const ms = manager.add({ ...base, id: "ms", slug: "haus" })
    ms.addSignal({ id: "in", packetId: "in", direction: "in", dataType: DataType.Analog, label: "" })
    ms.addSignal({ id: "out", packetId: "out", direction: "out", dataType: DataType.Analog, label: "" })
    wires.add({ id: "w", label: "w", sourceId: "in", targetId: "out" })
    await ms.dispose()
    assert.equal(wires.list().length, 1)
    await manager.remove("ms")
    assert.deepEqual([signals.list(), wires.list()], [[], []])
  })

  test("a new Miniserver shows the status stopped", () => {
    manager.add({ ...base, id: "ms", slug: "haus" })
    assert.deepEqual(bus.current("system/loxone/haus/status")?.value, Value.string("stopped"))
  })
})
