import assert from "node:assert/strict"
import { once } from "node:events"
import { after, before, describe, test } from "node:test"
import type { DiscoveredPacketDto, LoxoneSignalDto, MiniserverDto, MiniserverLoadDto, SignalLoadDto } from "@lox-nexus/api"
import { DataPacket, DataType, IciSocket, PacketEncoder, RemotePeer } from "@lox-nexus/ici"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { ApiClient } from "../../test-support/ApiClient.ts"
import { TestApp } from "../../test-support/TestApp.ts"

/** a free UDP port on loopback (bound and released) */
const freePort = async () => {
  const socket = new IciSocket()
  await socket.bind(0, "127.0.0.1")
  const port = socket.address()!.port
  await socket.close()
  return port
}

describe("miniserver API", { timeout: 10_000 }, () => {
  let app: TestApp
  let admin: ApiClient
  let ms: MiniserverDto
  const loxone = new IciSocket()

  before(async () => {
    app = await TestApp.start()
    admin = await app.admin()
    await loxone.bind(0, "127.0.0.1")
  })
  after(async () => {
    await app.dispose()
    await loxone.close()
  })

  test("creating a Miniserver stores it, starts it and never returns the password", async () => {
    const response = await admin.post("/api/miniservers", {
      slug: "haus", label: "Haus", host: "127.0.0.1", port: loxone.address()!.port, listenPort: await freePort(),
      listenAddress: "127.0.0.1", ownId: "nexus", remoteId: "ms", password: "secret"
    })
    assert.equal(response.statusCode, 201, response.body)
    ms = response.json<MiniserverDto>()
    assert.deepEqual([ms.running, ms.health, ms.hasPassword, "password" in ms], [true, "waiting", true, false])
    assert.equal((await admin.get("/api/miniservers")).json<MiniserverDto[]>().length, 1)
  })

  test("invalid input is a 400 with the reason, a taken slug a 409", async () => {
    const invalid = await admin.post("/api/miniservers", { slug: "Not Valid", label: "", host: "", port: 0, listenPort: 0, ownId: "", remoteId: "" })
    assert.equal(invalid.statusCode, 400)
    const taken = await admin.post("/api/miniservers", { slug: "haus", label: "", host: "h", port: 1, listenPort: 2, ownId: "a", remoteId: "b", enabled: false })
    assert.equal(taken.statusCode, 409)
    assert.deepEqual(taken.json(), { error: "slug \"haus\" is already used by another miniserver", code: "slug-taken" })
    assert.equal((await admin.get("/api/miniservers/nope")).statusCode, 404)
  })

  test("an unknown packet id is discovered and can be adopted", async () => {
    const peer = new RemotePeer(loxone, { ownId: "ms", remoteId: "nexus", host: "127.0.0.1", port: ms.listenPort, resendInterval: 0 })
    const discovered = new Promise(resolve => app.app.bus.subscribe("loxone/haus/discovered/+", resolve))
    await peer.output("temp", DataType.Analog).set(21.5)
    await discovered
    const list = (await admin.get(`/api/miniservers/${ms.id}/discovered`)).json<DiscoveredPacketDto[]>()
    assert.deepEqual(list.map(d => [d.packetId, d.dataType]), [["temp", DataType.Analog]])
    const adopted = await admin.post(`/api/miniservers/${ms.id}/discovered/adopt`, { packetId: "temp", label: "Temperature" })
    assert.equal(adopted.statusCode, 201, adopted.body)
    assert.equal(adopted.json<LoxoneSignalDto>().topic, "loxone/haus/in/temp")
    assert.equal(app.app.bus.current("loxone/haus/discovered/temp"), undefined, "the discovered value goes with the adoption")
    const arrived = new Promise(resolve => app.app.bus.subscribe("loxone/haus/in/temp", resolve))
    await peer.output("temp", DataType.Analog).resend()
    await arrived
    assert.deepEqual(app.app.bus.current("loxone/haus/in/temp")?.value, Value.number(21.5))
    peer.close()
  })

  test("an RGBW packet carrying a colour temperature is adopted as a Lumitech signal", async () => {
    const payload = Buffer.alloc(8)
    payload.writeDoubleLE(200702200)
    const discovered = new Promise(resolve => app.app.bus.subscribe("loxone/haus/discovered/lcout", resolve))
    await loxone.send(new PacketEncoder().encodeData(new DataPacket("ms", "nexus", "lcout", DataType.SmartRgbw, payload)), ms.listenPort, "127.0.0.1")
    await discovered
    const adopted = (await admin.post(`/api/miniservers/${ms.id}/discovered/adopt`, { packetId: "lcout" })).json<LoxoneSignalDto>()
    assert.deepEqual([adopted.dataType, adopted.lumitech], [DataType.SmartRgbw, true], "what discovery showed is kept")
    await admin.delete(`/api/miniservers/${ms.id}/signals/${adopted.id}`)
  })

  test("an output signal sends forced values to the Miniserver", async () => {
    const signal = (await admin.post(`/api/miniservers/${ms.id}/signals`, { packetId: "mood", direction: "out", dataType: 1, label: "Mood" })).json<LoxoneSignalDto>()
    assert.equal(signal.topic, "loxone/haus/out/mood")
    const packet = once(loxone, "datagram")
    assert.equal((await admin.post("/api/bus/forces", { topic: signal.topic, value: Value.number(69) })).statusCode, 204)
    const [buffer] = await packet as [Buffer]
    assert.ok(buffer.includes(Buffer.from("mood")))
    assert.equal((await admin.get("/api/bus/forces")).json<Array<{ by: string }>>()[0]!.by, "admin")
  })

  test("the load endpoint reports traffic against Loxone's limit", async () => {
    const load = (await admin.get(`/api/miniservers/${ms.id}/load`)).json<MiniserverLoadDto>()
    assert.deepEqual([load.limitPerSecond, load.windowSeconds], [35, 120])
    assert.ok(load.current.incomingPerSecond > 0 && load.current.outgoingPerSecond > 0, "packets went both ways in the tests above")
    assert.equal(typeof (await admin.get(`/api/miniservers/${ms.id}`)).json<MiniserverDto>().load, "number")
    const signals = (await admin.get(`/api/miniservers/${ms.id}/signals`)).json<LoxoneSignalDto[]>()
    const shares = (await admin.get(`/api/miniservers/${ms.id}/signal-load`)).json<SignalLoadDto>()
    assert.ok(Object.keys(shares).every(id => signals.some(s => s.id === id)), "only signals of this Miniserver")
    assert.ok(Object.values(shares).length > 0 && Object.values(shares).every(percent => percent > 0), "only signals with traffic")
    assert.equal((await admin.get("/api/miniservers/nope/signal-load")).statusCode, 404)
    // the breakdown explains the total; the signals' part is what the signal list shows
    const parts = Object.values(load.breakdown).reduce((sum, part) => sum + part, 0)
    assert.ok(Math.abs(parts - load.current.percent) < 0.005, `${JSON.stringify(load.breakdown)} adds up to ${load.current.percent}`)
    assert.ok(load.breakdown.unconfigured > 0, "the packets discovered above had no signal then")
  })

  test("renaming keeps signals, updating keeps the password, stop and start work", async () => {
    const { slug, label, host, port, listenPort, listenAddress, ownId, remoteId, enabled, resendInterval } = ms
    const config = { slug, label, host, port, listenPort, listenAddress, ownId, remoteId, enabled, resendInterval }
    const updated = (await admin.put(`/api/miniservers/${ms.id}`, { ...config, slug: "home" })).json<MiniserverDto>()
    assert.deepEqual([updated.slug, updated.hasPassword, updated.running], ["home", true, true])
    const topics = (await admin.get(`/api/miniservers/${ms.id}/signals`)).json<LoxoneSignalDto[]>().map(s => s.topic).sort()
    assert.deepEqual(topics, ["loxone/home/in/temp", "loxone/home/out/mood"])
    assert.equal((await admin.post(`/api/miniservers/${ms.id}/stop`)).json<MiniserverDto>().health, "stopped")
    assert.equal((await admin.post(`/api/miniservers/${ms.id}/start`)).json<MiniserverDto>().running, true)
  })

  test("deleting a signal releases its force and forgets its value", async () => {
    const mood = (await admin.get(`/api/miniservers/${ms.id}/signals`)).json<LoxoneSignalDto[]>().find(s => s.packetId === "mood")!
    // the earlier force stayed on the old topic when the Miniserver was renamed (documented)
    await admin.delete(`/api/bus/forces?topic=${encodeURIComponent("loxone/haus/out/mood")}`)
    await admin.post("/api/bus/forces", { topic: mood.topic, value: Value.number(1) })
    assert.equal((await admin.delete(`/api/miniservers/${ms.id}/signals/${mood.id}`)).statusCode, 204)
    assert.deepEqual(app.app.bus.activeForces(), [])
    assert.equal(app.app.bus.current(mood.topic), undefined)
    assert.deepEqual(app.app.persistence.db.all("SELECT topic FROM forces"), [])
  })

  test("deleting a Miniserver removes its signals, rows and retained topics", async () => {
    assert.equal((await admin.delete(`/api/miniservers/${ms.id}`)).statusCode, 204)
    assert.deepEqual(app.app.signals.list(), [])
    assert.deepEqual((await admin.get("/api/miniservers")).json(), [])
    const db = app.app.persistence.db
    assert.deepEqual([db.all("SELECT * FROM signals"), db.all("SELECT * FROM loxone_signals")], [[], []])
    assert.deepEqual([app.app.bus.currentMatching("loxone/home/#"), app.app.bus.currentMatching("system/loxone/home/#")], [[], []])
  })
})
