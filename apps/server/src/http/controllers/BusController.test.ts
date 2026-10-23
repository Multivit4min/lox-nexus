import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import type { BusMessageDto, SignalDto, TraceNodeDto, WireDto } from "@lox-nexus/api"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { ApiClient } from "../../test-support/ApiClient.ts"
import { TestApp } from "../../test-support/TestApp.ts"

describe("bus and wire API", { timeout: 10_000 }, () => {
  let app: TestApp
  let admin: ApiClient

  before(async () => {
    app = await TestApp.start()
    admin = await app.admin()
    const ms = (await admin.post("/api/miniservers", {
      slug: "haus", label: "Haus", host: "127.0.0.1", port: 9, listenPort: 9, ownId: "nexus", remoteId: "ms", enabled: false
    })).json<{ id: string }>()
    await admin.post(`/api/miniservers/${ms.id}/signals`, { packetId: "in", direction: "in", dataType: 1, label: "In" })
    await admin.post(`/api/miniservers/${ms.id}/signals`, { packetId: "out", direction: "out", dataType: 0, label: "Out" })
  })
  after(() => app.dispose())

  const signal = async (topic: string) => (await admin.get("/api/signals")).json<SignalDto[]>().find(s => s.topic === topic)!

  test("wires: create, refuse a second wire to the same target, list, update, delete", async () => {
    const [source, target] = [await signal("loxone/haus/in/in"), await signal("loxone/haus/out/out")]
    const created = await admin.post("/api/wires", { label: "in to out", sourceId: source.id, targetId: target.id, transforms: [{ op: "invert" }] })
    assert.equal(created.statusCode, 201, created.body)
    const wire = created.json<WireDto>()
    assert.equal((await admin.post("/api/wires", { label: "again", sourceId: source.id, targetId: target.id })).statusCode, 409)
    assert.equal((await admin.post("/api/wires", { label: "bad", sourceId: source.id, targetId: target.id, transforms: [{ op: "nope" }] })).statusCode, 400)
    const updated = await admin.put(`/api/wires/${wire.id}`, { label: "renamed", sourceId: source.id, targetId: target.id })
    assert.equal(updated.json<WireDto>().label, "renamed")
    assert.deepEqual((await admin.get("/api/wires")).json<WireDto[]>().map(w => [w.label, w.active]), [["renamed", true]])
  })

  test("injected values flow through the wire and can be traced", async () => {
    assert.equal((await admin.post("/api/bus/inject", { topic: "loxone/haus/in/in", value: Value.number(1) })).statusCode, 204)
    assert.deepEqual((await signal("loxone/haus/out/out")).current?.value, Value.boolean(true))
    const messages = (await admin.get("/api/bus/messages?pattern=loxone/%23&limit=10")).json<BusMessageDto[]>()
    const injected = messages.find(m => m.topic === "loxone/haus/in/in")!
    assert.deepEqual([injected.flags, injected.source], [{ injected: true }, { kind: "user", id: "admin" }])
    const [root] = (await admin.get(`/api/bus/messages/${injected.id}/trace`)).json<TraceNodeDto[]>()
    assert.deepEqual(root!.children.map(c => c.message.topic), ["loxone/haus/out/out"])
  })

  test("force and release a topic", async () => {
    const topic = "loxone/haus/out/out"
    assert.equal((await admin.post("/api/bus/forces", { topic, value: Value.boolean(false), reason: "maintenance" })).statusCode, 204)
    assert.deepEqual((await signal(topic)).current?.value, Value.boolean(false))
    const current = (await admin.get("/api/bus/current?pattern=loxone/haus/out/%2B")).json<BusMessageDto[]>()
    assert.deepEqual(current.map(m => m.flags), [{ forced: true }])
    assert.equal((await admin.delete(`/api/bus/forces?topic=${encodeURIComponent(topic)}`)).statusCode, 204)
    assert.deepEqual((await signal(topic)).current?.value, Value.boolean(true), "the real value is back")
    assert.equal((await admin.delete(`/api/bus/forces?topic=${encodeURIComponent(topic)}`)).statusCode, 404)
  })

  test("invalid topics and expiries in the past are bad requests", async () => {
    assert.equal((await admin.post("/api/bus/inject", { topic: "Not/Valid", value: Value.number(1) })).statusCode, 400)
    assert.equal((await admin.post("/api/bus/forces", { topic: "a/b", value: Value.number(1), until: 1 })).statusCode, 400)
    assert.equal((await admin.get("/api/bus/current?pattern=a/%23/b")).statusCode, 400)
  })

  test("a wire update that can't be stored leaves the running wire unchanged", async () => {
    const [wire] = (await admin.get("/api/wires")).json<WireDto[]>()
    const [source, target] = [await signal("loxone/haus/in/in"), await signal("loxone/haus/out/out")]
    const ms = (await admin.get("/api/miniservers")).json<Array<{ id: string }>>()[0]!
    const other = (await admin.post(`/api/miniservers/${ms.id}/signals`, { packetId: "other", direction: "out", dataType: 1, label: "Other" })).json<{ id: string }>()
    // a stored wire that can't start (corrupt transforms) still owns its target in the database
    app.app.persistence.db.run("INSERT INTO wires VALUES ('broken', 'broken', :s, :t, 'not json', 1, 0)", { s: source.id, t: other.id })
    const moved = await admin.put(`/api/wires/${wire!.id}`, { label: "moved", sourceId: source.id, targetId: other.id })
    assert.equal(moved.statusCode, 409)
    assert.deepEqual(app.app.wires.list().map(w => [w.id, w.targetId]), [[wire!.id, target.id]])
    app.app.persistence.db.run("DELETE FROM wires WHERE id = 'broken'")
  })

  test("deleting a wire stops it", async () => {
    const [wire] = (await admin.get("/api/wires")).json<WireDto[]>()
    assert.equal((await admin.delete(`/api/wires/${wire!.id}`)).statusCode, 204)
    assert.deepEqual(app.app.wires.list(), [])
    assert.equal((await admin.delete(`/api/wires/${wire!.id}`)).statusCode, 404)
  })
})
