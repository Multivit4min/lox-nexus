import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { EventBus, SignalRegistry } from "@lox-nexus/core"
import { DataPacket, DataType, PacketEncoder } from "@lox-nexus/ici"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { MiniserverManager } from "./MiniserverManager.ts"
import { BusProbe } from "./test-support/BusProbe.ts"
import { FakeMiniserver } from "./test-support/FakeMiniserver.ts"

/** an RGBW datagram whose payload is a double, as a Lighting Controller output wired to an RGBW output sends it */
const rgbwCarrying = (packetId: string, number: number) => {
  const payload = Buffer.alloc(8)
  payload.writeDoubleLE(number)
  return new PacketEncoder().encodeData(new DataPacket("server", "claude", packetId, DataType.SmartRgbw, payload))
}

describe("RGBW inputs carrying a Loxone colour number", { timeout: 10_000 }, () => {
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

  test("an RGBW input decodes the colour that was meant instead of random channel levels", async t => {
    const { bus, ms, fake } = await setup(t)
    ms.addSignal({ id: "rgb", packetId: "lcout", direction: "in", dataType: DataType.SmartRgbw, label: "" })
    await ms.start()
    fake.connect(ms.listenPort!)
    let arrived = BusProbe.next(bus, "loxone/haus/in/lcout")
    await fake.sendRaw(rgbwCarrying("lcout", 100))
    assert.deepEqual((await arrived).value, Value.rgbw({ red: 100, green: 0, blue: 0, white: 0, fadeTime: 0, flags: 0 }), "not garbage")
    arrived = BusProbe.next(bus, "loxone/haus/in/lcout")
    await fake.sendRaw(rgbwCarrying("lcout", 200504000))
    assert.equal((await arrived).value?.type, "rgbw", "a colour temperature arrives as the signal's own type")
  })
})
