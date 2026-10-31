import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import type { CreatedAccessTokenDto, WireDto } from "@lox-nexus/api"
import type { ApiClient } from "../test-support/ApiClient.ts"
import { TestApp } from "../test-support/TestApp.ts"

type Answer = { text: string; isError?: boolean }

describe("MCP wire tools", { timeout: 30_000 }, () => {
  let app: TestApp
  let admin: ApiClient
  let token: string
  let id = 0
  const call = async (name: string, args: Record<string, unknown> = {}): Promise<Answer> => {
    const answer = await app.client().post("/mcp", { jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }, { authorization: `Bearer ${token}` })
    const { result } = answer.json<{ result: { content: { text: string }[]; isError?: boolean } }>()
    return { text: result.content[0]!.text, ...(result.isError ? { isError: true } : {}) }
  }
  const json = async <T>(name: string, args?: Record<string, unknown>) => {
    const answer = await call(name, args)
    assert.ok(!answer.isError, answer.text)
    return JSON.parse(answer.text) as T
  }
  const wires = async () => (await admin.get("/api/wires")).json<WireDto[]>()

  before(async () => {
    app = await TestApp.start()
    admin = await app.admin()
    const ms = (await admin.post("/api/miniservers", { slug: "haus", label: "Haus", host: "127.0.0.1", port: 7000, listenPort: 7001, ownId: "nexus", remoteId: "ms", enabled: false })).json<{ id: string }>()
    for (const [packetId, direction, dataType, label] of [["temp", "in", 1, "Temperature"], ["heat", "out", 0, "Heating"], ["level", "out", 1, "Level"]] as const) {
      await admin.post(`/api/miniservers/${ms.id}/signals`, { packetId, direction, dataType, label })
    }
    token = (await admin.post("/api/tokens", { currentPassword: "correct horse", name: "agent", scopes: ["configure"] })).json<CreatedAccessTokenDto>().token
  })
  after(() => app.dispose())

  test("preview_wire shows each step and what the target gets; invalid steps name the field", async () => {
    const preview = await json<{ steps: Array<{ op: string }>; delivered: { type: string; value: unknown } }>("preview_wire", {
      value: { type: "number", value: 50 }, transforms: [{ op: "scale", from: [0, 100], to: [0, 1] }], target: "loxone/haus/out/heat"
    })
    assert.deepEqual(preview.steps.map(step => step.op), ["scale"])
    assert.deepEqual(preview.delivered, { type: "boolean", value: true })
    const invalid = await call("preview_wire", { value: { type: "number", value: 1 }, transforms: [{ op: "scale", from: [0, 100] }] })
    assert.ok(invalid.isError)
    assert.match(invalid.text, /to/)
  })

  test("create_wire takes topics and names the wire after both ends", async () => {
    const created = await json<{ id: string; label: string; active: boolean }>("create_wire", { source: "loxone/haus/in/temp", target: "loxone/haus/out/heat", transforms: [{ op: "convert", to: "boolean" }] })
    assert.equal(created.label, "Temperature → Heating")
    assert.equal(created.active, true)
    const taken = await call("create_wire", { source: "loxone/haus/in/temp", target: "loxone/haus/out/heat" })
    assert.ok(taken.isError, "a target takes one wire")
    assert.match((await call("create_wire", { source: "loxone/haus/in/nope", target: "loxone/haus/out/level" })).text, /signal "loxone\/haus\/in\/nope"/)
  })

  test("update_wire changes only what is given, named by its target", async () => {
    const updated = await json<{ wire: string; transforms: string[]; enabled: boolean }>("update_wire", { wire: "loxone/haus/out/heat", enabled: false })
    assert.deepEqual(updated.transforms, ["convert"], "the steps stay")
    assert.equal(updated.enabled, false)
    const moved = await json<{ wire: string }>("update_wire", { wire: "loxone/haus/out/heat", target: "loxone/haus/out/level", transforms: [] })
    assert.equal(moved.wire, "loxone/haus/in/temp → loxone/haus/out/level")
    const [wire] = await wires()
    assert.deepEqual([wire!.label, wire!.transforms, wire!.enabled], ["Temperature → Level", [], false], "a label made from the ends follows them")
    await json("update_wire", { wire: "loxone/haus/out/level", label: "Mine" })
    await json("update_wire", { wire: "loxone/haus/out/level", target: "loxone/haus/out/heat" })
    assert.equal((await wires())[0]!.label, "Mine", "a chosen one stays")
    await json("update_wire", { wire: "loxone/haus/out/heat", target: "loxone/haus/out/level", label: "Temperature → Level" })
  })

  test("delete_wires names what goes and needs the confirmation", async () => {
    const first = await json<{ summary: string; confirmation: string }>("delete_wires", { wires: ["loxone/haus/out/level"] })
    assert.equal(first.summary, "deletes 1 wire: loxone/haus/in/temp → loxone/haus/out/level")
    assert.equal((await wires()).length, 1)
    const done = await json<Array<{ ok?: string }>>("delete_wires", { wires: ["loxone/haus/out/level"], confirmation: first.confirmation })
    assert.deepEqual(done, [{ ok: "loxone/haus/in/temp → loxone/haus/out/level" }])
    assert.equal((await wires()).length, 0)
  })
})
