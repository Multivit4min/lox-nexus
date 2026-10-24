import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import type { SignalDto, WireDto, WirePreviewDto } from "@lox-nexus/api"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { ApiClient } from "../../test-support/ApiClient.ts"
import { TestApp } from "../../test-support/TestApp.ts"

describe("what the wire editor needs", { timeout: 10_000 }, () => {
  let app: TestApp
  let admin: ApiClient
  let ms: { id: string }

  before(async () => {
    app = await TestApp.start()
    admin = await app.admin()
    ms = (await admin.post("/api/miniservers", {
      slug: "haus", label: "Haus", host: "127.0.0.1", port: 9, listenPort: 9, ownId: "nexus", remoteId: "ms", enabled: false
    })).json<{ id: string }>()
    await admin.post(`/api/miniservers/${ms.id}/signals`, { packetId: "in", direction: "in", dataType: 1, label: "In" })
    await admin.post(`/api/miniservers/${ms.id}/signals`, { packetId: "out", direction: "out", dataType: 0, label: "Out" })
  })
  after(() => app.dispose())

  const signal = async (topic: string) => (await admin.get("/api/signals")).json<SignalDto[]>().find(s => s.topic === topic)!

  test("signals name their owner", async () => {
    assert.deepEqual((await signal("loxone/haus/in/in")).owner, { kind: "miniserver", id: ms.id })
  })

  test("the preview shows each step and converts to the target's type", async () => {
    const target = await signal("loxone/haus/out/out")
    const transforms = [{ op: "scale", from: [0, 100], to: [0, 1] }, { op: "debounce", ms: 200 }]
    const response = await admin.post("/api/wires/preview", { value: Value.number(50), transforms, targetId: target.id })
    assert.equal(response.statusCode, 200, response.body)
    const preview = response.json<WirePreviewDto>()
    assert.deepEqual(preview.steps.map(step => step.value), [Value.number(0.5), Value.number(0.5)])
    assert.match(preview.steps[1]?.note ?? "", /200 ms/)
    assert.deepEqual(preview.delivered, Value.boolean(true), "Out is digital")
  })

  test("a preview refuses invalid transforms with their path, and unknown targets", async () => {
    const invalid = await admin.post("/api/wires/preview", { value: Value.number(1), transforms: [{ op: "invert" }, { op: "scale", from: [1, 1], to: [0, 1] }] })
    assert.equal(invalid.statusCode, 400)
    assert.deepEqual(invalid.json<{ issues: Array<{ path: unknown[] }> }>().issues[0]?.path.slice(0, 3), ["transforms", 1, "from"], "the same path as when saving")
    assert.equal((await admin.post("/api/wires/preview", { value: Value.number(1), transforms: [], targetId: "nope" })).statusCode, 404)
  })

  test("a stored wire that can't start says why", async () => {
    const [source, target] = [await signal("loxone/haus/in/in"), await signal("loxone/haus/out/out")]
    app.app.persistence.db.run("INSERT INTO wires VALUES ('broken', 'broken', :s, :t, '[{\"op\":\"debounce\",\"ms\":0}]', 1, 0)", { s: source.id, t: target.id })
    const [wire] = (await admin.get("/api/wires")).json<WireDto[]>()
    assert.equal(wire?.active, false)
    assert.match(wire?.problem ?? "", /^transforms\.0\.ms: /)
    const fixed = await admin.put("/api/wires/broken", { label: "fixed", sourceId: source.id, targetId: target.id, transforms: [] })
    assert.equal(fixed.statusCode, 200, fixed.body)
    assert.deepEqual((await admin.get("/api/wires")).json<WireDto[]>().map(w => [w.active, w.problem]), [[true, undefined]])
    assert.equal((await admin.delete("/api/wires/broken")).statusCode, 204)
  })

  test("stored steps the UI can't read come as unsupported, and are exported as stored", async () => {
    const [source, target] = [await signal("loxone/haus/in/in"), await signal("loxone/haus/out/out")]
    const stored = [{ op: "invert" }, { op: "scale", to: [0, 1] }, { op: "fromTheFuture", x: 1 }]
    app.app.persistence.db.run("INSERT INTO wires VALUES ('odd', 'odd', :s, :t, :json, 1, 0)", { s: source.id, t: target.id, json: JSON.stringify(stored) })
    const [wire] = (await admin.get("/api/wires")).json<WireDto[]>()
    assert.deepEqual(wire?.transforms, [{ op: "invert" }, { op: "unsupported", raw: stored[1] }, { op: "unsupported", raw: stored[2] }])
    const exported = (await admin.get("/api/config/export")).json<{ wires: WireDto[] }>()
    assert.deepEqual(exported.wires.find(w => w.id === "odd")?.transforms, stored)
    app.app.persistence.db.run("UPDATE wires SET transforms = '{}' WHERE id = 'odd'")
    assert.deepEqual((await admin.get("/api/wires")).json<WireDto[]>()[0]?.transforms, [{ op: "unsupported", raw: {} }])
    assert.equal((await admin.delete("/api/wires/odd")).statusCode, 204)
  })

  test("a wire stopped by a signal change starts again when the change is undone", async () => {
    const [source, target] = [await signal("loxone/haus/in/in"), await signal("loxone/haus/out/out")]
    assert.equal((await admin.post("/api/wires", { label: "w", sourceId: source.id, targetId: target.id })).statusCode, 201)
    const edit = (direction: string) => admin.put(`/api/miniservers/${ms.id}/signals/${target.id}`, { packetId: "out", direction, dataType: 0, label: "Out" })
    assert.equal((await edit("in")).statusCode, 200)
    const [stopped] = (await admin.get("/api/wires")).json<WireDto[]>()
    assert.deepEqual([stopped?.active, stopped?.problem], [false, "\"Out\" is not a target"])
    assert.equal((await edit("out")).statusCode, 200)
    assert.deepEqual((await admin.get("/api/wires")).json<WireDto[]>().map(w => [w.active, w.problem]), [[true, undefined]])
  })
})
