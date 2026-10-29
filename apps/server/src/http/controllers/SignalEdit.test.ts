import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import type { ForceDto, LoxoneSignalDto, MiniserverDto, WireDto } from "@lox-nexus/api"
import { IciReceiver, IciSocket, type DataEvent } from "@lox-nexus/ici"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { ApiClient } from "../../test-support/ApiClient.ts"
import { TestApp } from "../../test-support/TestApp.ts"

describe("editing a Loxone signal over the API", { timeout: 10_000 }, () => {
  let app: TestApp
  let admin: ApiClient
  let base: string
  let pump: LoxoneSignalDto
  let level: LoxoneSignalDto

  before(async () => {
    app = await TestApp.start()
    admin = await app.admin()
    const ms = (await admin.post("/api/miniservers", {
      slug: "haus", label: "Haus", host: "127.0.0.1", port: 7777, listenPort: 7000, ownId: "nexus", remoteId: "ms", enabled: false
    })).json<MiniserverDto>()
    base = `/api/miniservers/${ms.id}/signals`
    level = (await admin.post(base, { packetId: "level", direction: "in", dataType: 1, label: "Level" })).json<LoxoneSignalDto>()
    pump = (await admin.post(base, { packetId: "pump", direction: "out", dataType: 1, label: "Pump" })).json<LoxoneSignalDto>()
    await admin.post("/api/wires", { label: "level to pump", sourceId: level.id, targetId: pump.id })
  })
  after(() => app.dispose())

  test("PUT changes label, slug and packet id; the wire stays and the force moves along", async () => {
    await admin.post("/api/bus/inject", { topic: pump.topic, value: Value.number(1) })
    await admin.post("/api/bus/forces", { topic: pump.topic, value: Value.number(5), reason: "maintenance" })
    const response = await admin.put(`${base}/${pump.id}`, { packetId: "pump2", direction: "out", dataType: 1, label: "Main pump", slug: "main-pump" })
    assert.equal(response.statusCode, 200, response.body)
    const updated = response.json<LoxoneSignalDto>()
    assert.deepEqual([updated.topic, updated.packetId, updated.label, updated.valueType], ["loxone/haus/out/main-pump", "pump2", "Main pump", "number"])
    const wires = (await admin.get("/api/wires")).json<WireDto[]>()
    assert.deepEqual(wires.map(w => [w.targetId, w.active]), [[pump.id, true]])
    const forces = (await admin.get("/api/bus/forces")).json<ForceDto[]>()
    assert.deepEqual(forces.map(f => [f.topic, f.value, f.reason, f.by]), [["loxone/haus/out/main-pump", Value.number(5), "maintenance", "admin"]])
    assert.equal(app.app.bus.current(pump.topic), undefined, "nothing is left on the old topic")
    await admin.delete(`/api/bus/forces?topic=${encodeURIComponent(updated.topic)}`)
    assert.deepEqual(app.app.bus.current(updated.topic)?.value, Value.number(1), "the release restores the value moved from the old topic")
    const row = app.app.persistence.db.get<{ packet_id: string; slug: string }>("SELECT packet_id, slug FROM loxone_signals WHERE id = :id", { id: pump.id })
    assert.deepEqual({ ...row }, { packet_id: "pump2", slug: "main-pump" })
  })

  test("a clash is a 409, invalid input a 400, an unknown signal a 404; nothing changes", async () => {
    const clash = await admin.put(`${base}/${level.id}`, { packetId: "level", direction: "in", dataType: 1, label: "x", slug: "main-pump" })
    assert.equal(clash.statusCode, 200, "an in and an out signal may share a slug, their topics differ")
    const other = (await admin.post(base, { packetId: "other", direction: "in", dataType: 1, label: "Other" })).json<LoxoneSignalDto>()
    assert.equal((await admin.put(`${base}/${other.id}`, { packetId: "level", direction: "in", dataType: 1, label: "x" })).statusCode, 409)
    assert.equal((await admin.put(`${base}/${other.id}`, { packetId: "", direction: "in", dataType: 1, label: "x" })).statusCode, 400)
    assert.equal((await admin.put(`${base}/nope`, { packetId: "n", direction: "in", dataType: 1, label: "x" })).statusCode, 404)
    const stored = (await admin.get(base)).json<LoxoneSignalDto[]>().find(s => s.id === other.id)!
    assert.deepEqual([stored.packetId, stored.label], ["other", "Other"])
  })

  test("when storing fails, the running signal is put back as it was", async () => {
    const lost = (await admin.post(base, { packetId: "lost", direction: "in", dataType: 1, label: "Lost" })).json<LoxoneSignalDto>()
    app.app.persistence.db.run("DELETE FROM loxone_signals WHERE id = :id", { id: lost.id })
    const response = await admin.put(`${base}/${lost.id}`, { packetId: "found", direction: "in", dataType: 1, label: "Found", slug: "found" })
    assert.equal(response.statusCode, 500)
    assert.deepEqual([app.app.signals.require(lost.id).topic, app.app.signals.require(lost.id).label], [lost.topic, "Lost"])
  })
})

/** a free UDP port on loopback (bound and released) */
const freePort = async () => {
  const socket = new IciSocket()
  await socket.bind(0, "127.0.0.1")
  const port = socket.address()!.port
  await socket.close()
  return port
}

describe("editing a forced output of a running Miniserver", { timeout: 10_000 }, () => {
  let app: TestApp
  let admin: ApiClient
  const loxone = new IciSocket()
  const sent: Array<{ packetId: string; value: unknown }> = []
  let receiver: IciReceiver

  before(async () => {
    app = await TestApp.start()
    admin = await app.admin()
    await loxone.bind(0, "127.0.0.1")
    receiver = new IciReceiver(loxone, { ownId: "ms" })
    receiver.on("data", event => sent.push({ packetId: event.packet.packetId, value: event.value }))
  })
  after(async () => {
    receiver.dispose()
    await loxone.close()
    await app.dispose()
  })

  const next = (packetId: string) => new Promise<unknown>(resolve => {
    const listener = (event: DataEvent) => {
      if (event.packet.packetId !== packetId) return
      receiver.off("data", listener)
      resolve(event.value)
    }
    receiver.on("data", listener)
  })

  test("only the forced value reaches the Miniserver; the real one follows the release", async () => {
    const created = await admin.post("/api/miniservers", {
      slug: "haus", label: "Haus", host: "127.0.0.1", port: loxone.address()!.port, listenPort: await freePort(), listenAddress: "127.0.0.1",
      ownId: "nexus", remoteId: "ms", resendInterval: 0
    })
    assert.equal(created.statusCode, 201, created.body)
    const ms = created.json<MiniserverDto>()
    const base = `/api/miniservers/${ms.id}/signals`
    const pump = (await admin.post(base, { packetId: "pump", direction: "out", dataType: 1, label: "Pump" })).json<LoxoneSignalDto>()
    const real = next("pump")
    await admin.post("/api/bus/inject", { topic: pump.topic, value: Value.number(1) })
    assert.equal(await real, 1)
    const forced = next("pump")
    await admin.post("/api/bus/forces", { topic: pump.topic, value: Value.number(5) })
    assert.equal(await forced, 5)

    sent.length = 0
    const moved = next("pump2")
    const edited = await admin.put(`${base}/${pump.id}`, { packetId: "pump2", direction: "out", dataType: 1, label: "Pump", slug: "main" })
    assert.equal(edited.statusCode, 200, edited.body)
    assert.equal(await moved, 5)
    const released = next("pump2")
    await admin.delete(`/api/bus/forces?topic=${encodeURIComponent("loxone/haus/out/main")}`)
    assert.equal(await released, 1)
    assert.deepEqual(sent.filter(p => p.packetId === "pump2").map(p => p.value), [5, 1], "the real value never went out while forced")
  })

  test("a new data type (as a project import sends it) changes the packets at once, and the wire keeps running", async () => {
    const created = await admin.post("/api/miniservers", {
      slug: "keller", label: "Keller", host: "127.0.0.1", port: loxone.address()!.port, listenPort: await freePort(), listenAddress: "127.0.0.1",
      ownId: "nexus", remoteId: "ms", resendInterval: 0
    })
    const ms = created.json<MiniserverDto>()
    const base = `/api/miniservers/${ms.id}/signals`
    const level = (await admin.post(base, { packetId: "level", direction: "in", dataType: 1, label: "Level" })).json<LoxoneSignalDto>()
    const lamp = (await admin.post(base, { packetId: "lamp", direction: "out", dataType: 1, label: "Lamp" })).json<LoxoneSignalDto>()
    assert.equal((await admin.post("/api/wires", { label: "level → lamp", sourceId: level.id, targetId: lamp.id })).statusCode, 201)
    const analog = next("lamp")
    await admin.post("/api/bus/inject", { topic: level.topic, value: Value.number(0.7) })
    assert.equal(await analog, 0.7)

    const types: number[] = []
    receiver.on("data", event => event.packet.packetId === "lamp" && types.push(event.packet.dataType))
    const digital = next("lamp")
    const edited = await admin.put(`${base}/${lamp.id}`, { packetId: "lamp", direction: "out", dataType: 0, label: "Lamp", slug: lamp.slug })
    assert.equal(edited.statusCode, 200, edited.body)
    assert.equal(edited.json<LoxoneSignalDto>().topic, lamp.topic, "name and topic stay")
    await digital
    assert.deepEqual(types, [0], "resent as Digital")
    const [wire] = (await admin.get("/api/wires")).json<Array<{ active: boolean }>>()
    assert.equal(wire?.active, true)
    const later = next("lamp")
    await admin.post("/api/bus/inject", { topic: level.topic, value: Value.number(0) })
    await later
    assert.deepEqual(types, [0, 0], "values through the wire go out as Digital too")
  })
})
