import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { EventBus, SignalRegistry } from "@lox-nexus/core"
import { DataPacket, DataType, PacketEncoder } from "@lox-nexus/ici"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { MiniserverManager } from "./MiniserverManager.ts"
import { BusProbe } from "./test-support/BusProbe.ts"
import { FakeMiniserver } from "./test-support/FakeMiniserver.ts"

/** an RGBW datagram whose payload is a double, as a Lumitech output wired to an RGBW output sends it */
const rgbwCarrying = (packetId: string, number: number) => {
  const payload = Buffer.alloc(8)
  payload.writeDoubleLE(number)
  return new PacketEncoder().encodeData(new DataPacket("server", "claude", packetId, DataType.SmartRgbw, payload))
}

describe("Lumitech signals: Loxone colour numbers", { timeout: 10_000 }, () => {
  const setup = async (t: { after: (fn: () => Promise<void>) => void }) => {
    const signals = new SignalRegistry()
    const bus = new EventBus({ topicKinds: signals })
    const manager = new MiniserverManager({ bus, signals })
    const fake = new FakeMiniserver()
    const port = await fake.start()
    t.after(async () => {
      await manager.dispose()
      await fake.stop()
    })
    const ms = manager.add({ id: "ms", slug: "haus", label: "", host: "127.0.0.1", port, listenPort: 0, listenAddress: "127.0.0.1", ownId: "claude", remoteId: "server", resendInterval: 0 })
    return { bus, signals, ms, fake }
  }

  test("an Analog Lumitech input publishes temperatures as tunableWhite and colours as rgbw", async t => {
    const { bus, signals, ms, fake } = await setup(t)
    ms.addSignal({ id: "lc", packetId: "lcana", direction: "in", dataType: DataType.Analog, label: "", lumitech: true })
    assert.equal(signals.get("lc")?.valueType, "any")
    await ms.start()
    fake.connect(ms.listenPort!)
    let arrived = BusProbe.next(bus, "loxone/haus/in/lcana")
    await fake.send("lcana", DataType.Analog, 200702200)
    assert.deepEqual((await arrived).value, Value.tunableWhite({ temperature: 2200, brightness: 70, fadeTime: 0 }))
    arrived = BusProbe.next(bus, "loxone/haus/in/lcana")
    await fake.send("lcana", DataType.Analog, 60001000)
    assert.deepEqual((await arrived).value, Value.rgbw({ red: 0, green: 1, blue: 60, white: 0, fadeTime: 0, flags: 0 }))
  })

  test("an RGBW input carrying a colour number's bytes is decoded, and says how to keep temperatures", async t => {
    const { bus, ms, fake } = await setup(t)
    ms.addSignal({ id: "plain", packetId: "lcout", direction: "in", dataType: DataType.SmartRgbw, label: "" })
    ms.addSignal({ id: "kept", packetId: "lcout3", direction: "in", dataType: DataType.SmartRgbw, label: "", lumitech: true })
    await ms.start()
    fake.connect(ms.listenPort!)
    const plain = BusProbe.next(bus, "loxone/haus/in/lcout")
    const kept = BusProbe.next(bus, "loxone/haus/in/lcout3")
    const hint = BusProbe.next(bus, "system/loxone/haus/error", message => /turn on "Lumitech"/.test(message.text ?? ""))
    await fake.sendRaw(rgbwCarrying("lcout", 100))
    await fake.sendRaw(rgbwCarrying("lcout3", 200504000))
    assert.deepEqual((await plain).value, Value.rgbw({ red: 100, green: 0, blue: 0, white: 0, fadeTime: 0, flags: 0 }), "not garbage")
    assert.deepEqual((await kept).value, Value.tunableWhite({ temperature: 4000, brightness: 50, fadeTime: 0 }))
    await hint
  })

  test("a Lumitech output sends colour numbers; the option is refused where it can't work", async t => {
    const { bus, ms, fake } = await setup(t)
    ms.addSignal({ id: "out", packetId: "lamp", direction: "out", dataType: DataType.Analog, label: "", lumitech: true })
    await ms.start()
    fake.connect(ms.listenPort!)
    const source = { source: { kind: "user" as const, id: "t" } }
    let sent = fake.received("lamp")
    bus.publish("loxone/haus/out/lamp", Value.tunableWhite({ temperature: 3000, brightness: 40, fadeTime: 1 }), source)
    assert.equal((await sent).value, 200403000)
    sent = fake.received("lamp")
    bus.publish("loxone/haus/out/lamp", Value.rgbw({ red: 50, green: 0, blue: 0, white: 20, fadeTime: 0, flags: 0 }), source)
    assert.equal((await sent).value, 20020070, "white is added to every channel")
    sent = fake.received("lamp")
    bus.publish("loxone/haus/out/lamp", Value.number(50), source)
    assert.equal((await sent).value, 50, "a number is a colour number as it is: red 50 %")
    const refused = BusProbe.next(bus, "system/loxone/haus/error", message => /not a Loxone colour number/.test(message.text ?? ""))
    bus.publish("loxone/haus/out/lamp", Value.number(50.5), source)
    await refused
    assert.throws(() => ms.addSignal({ id: "x", packetId: "x", direction: "out", dataType: DataType.SmartRgbw, label: "", lumitech: true }), /only for Analog signals and RGBW inputs/)
    assert.throws(() => ms.addSignal({ id: "y", packetId: "y", direction: "in", dataType: DataType.Digital, label: "", lumitech: true }), /only for Analog/)
  })
})
