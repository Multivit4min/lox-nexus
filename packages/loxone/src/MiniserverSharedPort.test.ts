import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, test } from "node:test"
import { EventBus, SignalRegistry } from "@lox-nexus/core"
import { DataType, IciSocket } from "@lox-nexus/ici"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { MiniserverManager } from "./MiniserverManager.ts"
import { BusProbe } from "./test-support/BusProbe.ts"
import { FakeMiniserver } from "./test-support/FakeMiniserver.ts"

/** a free UDP port on loopback (bound and released) */
const freePort = async () => {
  const socket = new IciSocket()
  await socket.bind(0, "127.0.0.1")
  const port = socket.address()!.port
  await socket.close()
  return port
}

describe("Miniservers sharing a listen port", { timeout: 10_000 }, () => {
  let bus: EventBus
  let manager: MiniserverManager
  let fakes: FakeMiniserver[]
  let listenPort: number
  const config = (id: string, port: number, remoteId: string) => ({
    id, slug: id, label: id, host: "127.0.0.1", port, listenPort, listenAddress: "127.0.0.1", ownId: "claude", remoteId, resendInterval: 0
  })

  beforeEach(async () => {
    bus = new EventBus()
    manager = new MiniserverManager({ bus, signals: new SignalRegistry() })
    fakes = [new FakeMiniserver("server"), new FakeMiniserver("other")]
    listenPort = await freePort()
  })
  afterEach(async () => {
    await manager.dispose()
    await Promise.all(fakes.map(fake => fake.stop()))
  })

  test("each gets the packets of its own Miniserver; one stopping leaves the other running", async () => {
    const [server, other] = fakes as [FakeMiniserver, FakeMiniserver]
    const a = manager.add(config("a", await server.start(), "server"))
    const b = manager.add(config("b", await other.start(), "other"))
    for (const ms of [a, b]) ms.addSignal({ id: `${ms.config.id}-temp`, packetId: "temp", direction: "in", dataType: DataType.Analog, label: "" })
    assert.deepEqual(await manager.startEnabled(), [])
    assert.equal(a.listenPort, b.listenPort)
    server.connect(listenPort)
    other.connect(listenPort)

    const toA = BusProbe.next(bus, "loxone/a/in/temp")
    await server.send("temp", DataType.Analog, 21)
    assert.deepEqual((await toA).value, Value.number(21))
    const toB = BusProbe.next(bus, "loxone/b/in/temp")
    await other.send("temp", DataType.Analog, 5)
    assert.deepEqual((await toB).value, Value.number(5))
    assert.deepEqual(bus.current("loxone/a/in/temp")?.value, Value.number(21), "b's packet didn't reach a")

    await a.stop()
    const stillB = BusProbe.next(bus, "loxone/b/in/temp")
    await other.send("temp", DataType.Analog, 6)
    assert.deepEqual((await stillB).value, Value.number(6))
    await b.stop()
    const free = new IciSocket()
    await free.bind(listenPort, "127.0.0.1")
    await free.close()
  })

  test("the same ids on the same port are refused, on add and on update", () => {
    manager.add(config("a", 1, "server"))
    assert.throws(() => manager.add(config("b", 2, "server")), /already listens on port \d+ with the same ids/)
    const b = manager.add(config("b", 2, "other"))
    return assert.rejects(manager.update(b.config.id, { ...b.config, remoteId: "server" }), /same ids/)
  })
})
