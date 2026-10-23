import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, test } from "node:test"
import { EventBus, SignalRegistry, WireEngine } from "@lox-nexus/core"
import { DataType } from "@lox-nexus/ici"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { Miniserver } from "./Miniserver.ts"
import { MiniserverManager } from "./MiniserverManager.ts"
import { FakeMiniserver } from "./test-support/FakeMiniserver.ts"

const user = { source: { kind: "user" as const, id: "test" } }

describe("editing a Loxone signal", { timeout: 10_000 }, () => {
  let signals: SignalRegistry
  let bus: EventBus
  let wires: WireEngine
  let manager: MiniserverManager
  let fake: FakeMiniserver
  let ms: Miniserver

  beforeEach(async () => {
    signals = new SignalRegistry()
    bus = new EventBus({ topicKinds: signals })
    wires = new WireEngine(bus, signals)
    manager = new MiniserverManager({ bus, signals })
    fake = new FakeMiniserver()
    const port = await fake.start()
    ms = manager.add({
      id: "ms", slug: "haus", label: "Haus", host: "127.0.0.1", port, listenPort: 0, listenAddress: "127.0.0.1",
      ownId: "claude", remoteId: "server", resendInterval: 0
    })
    ms.addSignal({ id: "in", packetId: "in", direction: "in", dataType: DataType.Analog, label: "In" })
    ms.addSignal({ id: "out", packetId: "out", direction: "out", dataType: DataType.Analog, label: "Out" })
    wires.add({ id: "w", label: "in to out", sourceId: "in", targetId: "out" })
  })

  afterEach(async () => {
    await wires.dispose()
    await manager.dispose()
    await fake.stop()
  })

  test("a new label and slug move the topic and keep the wire", async () => {
    ms.updateSignal({ id: "out", packetId: "out", direction: "out", dataType: DataType.Analog, label: "Pump", slug: "pump" })
    assert.equal(ms.topicOf("out"), "loxone/haus/out/pump")
    assert.equal(signals.require("out").label, "Pump")
    await ms.start()
    fake.connect(ms.listenPort!)
    const received = fake.received("out")
    await fake.send("in", DataType.Analog, 7)
    assert.equal((await received).value, 7, "the wire now publishes to the new topic, which is sent")
  })

  test("a new packet id sends the output's current value under it while running", async () => {
    await ms.start()
    bus.publish("loxone/haus/out/out", Value.number(4), user)
    const synced = fake.received("pump")
    ms.updateSignal({ id: "out", packetId: "pump", direction: "out", dataType: DataType.Analog, label: "Out", slug: "out" })
    assert.equal((await synced).value, 4)
  })

  test("a clash leaves the signal as it was", () => {
    ms.addSignal({ id: "other", packetId: "other", direction: "in", dataType: DataType.Analog, label: "" })
    assert.throws(() => ms.updateSignal({ id: "in", packetId: "other", direction: "in", dataType: DataType.Analog, label: "x" }), /already has an in signal/)
    assert.throws(() => ms.updateSignal({ id: "in", packetId: "in", direction: "in", dataType: DataType.Analog, label: "x", slug: "other" }), /already has a source signal/)
    assert.deepEqual([ms.topicOf("in"), signals.require("in").label, wires.list().length], ["loxone/haus/in/in", "In", 1])
  })

  test("an unknown id is refused", () => {
    assert.throws(() => ms.updateSignal({ id: "nope", packetId: "n", direction: "in", dataType: DataType.Analog, label: "" }), /unknown signal/)
  })
})
