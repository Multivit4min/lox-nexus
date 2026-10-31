import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import type { CreatedAccessTokenDto, LoxoneSignalDto } from "@lox-nexus/api"
import type { ApiClient } from "../test-support/ApiClient.ts"
import { TestApp } from "../test-support/TestApp.ts"

type Answer = { text: string; isError?: boolean }

describe("MCP Loxone tools", { timeout: 30_000 }, () => {
  let app: TestApp
  let admin: ApiClient
  let msId: string
  let tokens: { read: string; configure: string }
  let id = 0
  const call = async (name: string, args: Record<string, unknown> = {}, token = tokens.configure): Promise<Answer> => {
    const answer = await app.client().post("/mcp", { jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }, { authorization: `Bearer ${token}` })
    const body = answer.json<{ result?: { content: { text: string }[]; isError?: boolean }; error?: { message: string } }>()
    if (!body.result) return { text: body.error?.message ?? answer.body, isError: true }
    return { text: body.result.content[0]!.text, ...(body.result.isError ? { isError: true } : {}) }
  }
  const json = async <T>(name: string, args?: Record<string, unknown>) => {
    const answer = await call(name, args)
    assert.ok(!answer.isError, answer.text)
    return JSON.parse(answer.text) as T
  }
  const signals = async () => (await admin.get(`/api/miniservers/${msId}/signals`)).json<LoxoneSignalDto[]>()

  before(async () => {
    app = await TestApp.start()
    admin = await app.admin()
    msId = (await admin.post("/api/miniservers", { slug: "haus", label: "Haus", host: "127.0.0.1", port: 7000, listenPort: 7001, ownId: "nexus", remoteId: "ms", enabled: false })).json<{ id: string }>().id
    const token = async (scopes: string[]) => (await admin.post("/api/tokens", { currentPassword: "correct horse", name: scopes.join("+") || "read", scopes })).json<CreatedAccessTokenDto>().token
    tokens = { read: await token([]), configure: await token(["configure"]) }
  })
  after(() => app.dispose())

  test("a read token sees the Loxone side but not the tools that change it", async () => {
    const list = async (token: string) => {
      const answer = await app.client().post("/mcp", { jsonrpc: "2.0", id: ++id, method: "tools/list" }, { authorization: `Bearer ${token}` })
      return answer.json<{ result: { tools: { name: string; annotations?: Record<string, boolean> }[] } }>().result.tools
    }
    const read = (await list(tokens.read)).map(tool => tool.name)
    assert.ok(read.includes("loxone_side") && read.includes("diff_loxone_objects"))
    assert.ok(!read.includes("create_loxone_signals"))
    const configure = await list(tokens.configure)
    assert.equal(configure.find(tool => tool.name === "delete_loxone_signals")?.annotations?.destructiveHint, true)
    const refused = await call("create_loxone_signals", { miniserver: "haus", signals: [] }, tokens.read)
    assert.ok(refused.isError)
  })

  test("create: each item answers its topic or why it was refused", async () => {
    const results = await json<Array<{ ok?: string; failed?: string; error?: string }>>("create_loxone_signals", {
      miniserver: "haus",
      signals: [
        { packetId: "temp", direction: "in", dataType: 1, label: "Kelletrtür temperature", slug: "kelletrtur-temperature", unit: "°C", decimals: 1 },
        { packetId: "door", direction: "out", dataType: 0, label: "Door" },
        { packetId: "temp", direction: "in", dataType: 0, label: "Again" }
      ]
    })
    assert.equal(results[0]!.ok, "loxone/haus/in/kelletrtur-temperature")
    assert.equal(results[1]!.ok, "loxone/haus/out/door")
    assert.equal(results[2]!.failed, "in:temp")
    assert.match(results[2]!.error!, /temp/)
    assert.equal((await signals()).length, 2)
    assert.match((await call("create_loxone_signals", { miniserver: "nowhere", signals: [{ packetId: "x", direction: "in", dataType: 0, label: "X" }] })).text, /there are: haus/)
  })

  test("update merges what is given: a new label keeps the topic, the rest stays", async () => {
    const updated = await json<{ topic: string; label: string; movedFrom?: string }>("update_loxone_signal", { signal: "loxone/haus/in/kelletrtur-temperature", label: "Kellertür temperature" })
    assert.deepEqual(updated, { topic: "loxone/haus/in/kelletrtur-temperature", label: "Kellertür temperature", packetId: "temp", direction: "in", dataType: 1 })
    const stored = (await signals()).find(signal => signal.packetId === "temp")!
    assert.equal(stored.unit, "°C", "unit stays")
    assert.equal(stored.decimals, 1)
    const moved = await json<{ topic: string; movedFrom?: string }>("update_loxone_signal", { signal: stored.id, slug: "kellertur-temperature" })
    assert.deepEqual([moved.topic, moved.movedFrom], ["loxone/haus/in/kellertur-temperature", "loxone/haus/in/kelletrtur-temperature"])
    assert.ok((await call("update_loxone_signal", { signal: "loxone/haus/in/kellertur-temperature", dataType: 9 })).isError)
    await json("update_loxone_signal", { signal: "loxone/haus/in/kellertur-temperature", unit: "", decimals: null })
    const cleared = (await signals()).find(signal => signal.packetId === "temp")!
    assert.deepEqual([cleared.unit, cleared.decimals], [undefined, undefined], "\"\" and null clear a field")
    await json("update_loxone_signal", { signal: "loxone/haus/in/kellertur-temperature", unit: "°C", decimals: 1 })
  })

  test("loxone_side names the peer and an object per signal, opposite to the Nexus direction", async () => {
    const side = await json<{ miniserver: { iciId: string }; peer: { iciId: string; port: number; encrypted: boolean }; objects: Array<{ topic: string; loxone: Record<string, unknown> }> }>("loxone_side", { miniserver: "haus" })
    assert.equal(side.miniserver.iciId, "ms")
    assert.equal(side.peer.iciId, "nexus")
    assert.equal(side.peer.encrypted, false)
    const temp = side.objects.find(object => object.loxone.packetId === "temp")!
    assert.equal(temp.loxone.object, "intercommunication output")
    assert.equal(temp.loxone.unitFormat, "<v.1> °C")
    assert.equal(side.objects.find(object => object.loxone.packetId === "door")!.loxone.object, "intercommunication input")
    const some = await json<{ objects: unknown[]; notFound: string[] }>("loxone_side", { miniserver: "haus", signals: ["loxone/haus/out/door", "loxone/haus/out/typo"] })
    assert.deepEqual([some.objects.length, some.notFound], [1, ["loxone/haus/out/typo"]])
  })

  test("the loxone-side template answers like the tool; an unknown slug is an unknown resource", async () => {
    const read = (uri: string) => app.client().post("/mcp", { jsonrpc: "2.0", id: ++id, method: "resources/read", params: { uri } }, { authorization: `Bearer ${tokens.read}` })
    const found = (await read("nexus://miniservers/haus/loxone-side")).json<{ result: { contents: { text: string }[] } }>()
    assert.equal(JSON.parse(found.result.contents[0]!.text).peer.iciId, "nexus")
    assert.equal((await read("nexus://miniservers/nope/loxone-side")).json<{ error: { code: number } }>().error.code, -32002)
  })

  test("diff_loxone_objects: new, differs, same and removed, with inputs to create from", async () => {
    const diff = await json<{ new: Array<{ packetId: string; input: object }>; differs: Array<{ signal: string; change: string }>; same: number; removed: string[] }>("diff_loxone_objects", {
      miniserver: "haus",
      objects: [
        { packetId: "temp", direction: "in", dataType: 1, label: "Temperature" },
        { packetId: "door", direction: "out", dataType: 1, label: "Door" },
        { packetId: "lamp", direction: "out", dataType: 0, label: "Lamp" }
      ]
    })
    assert.deepEqual(diff.new, [{ packetId: "lamp", direction: "out", input: { packetId: "lamp", direction: "out", dataType: 0, label: "Lamp" } }])
    assert.deepEqual(diff.differs.map(row => row.change), ["Digital → Analog"])
    assert.equal(diff.same, 1)
    assert.deepEqual(diff.removed, [])
    // the round trip: what the diff answers is what create takes, and then nothing is new
    const created = await json<Array<{ ok?: string }>>("create_loxone_signals", { miniserver: "haus", signals: diff.new.map(row => row.input) })
    assert.deepEqual(created, [{ ok: "loxone/haus/out/lamp" }])
    const again = await json<{ new: unknown[]; same: number }>("diff_loxone_objects", { miniserver: "haus", objects: [{ packetId: "lamp", direction: "out", dataType: 0, label: "Lamp" }] })
    assert.deepEqual([again.new, again.same], [[], 1])
    await call("delete_loxone_signals", { signals: ["loxone/haus/out/lamp"], confirmation: JSON.parse((await call("delete_loxone_signals", { signals: ["loxone/haus/out/lamp"] })).text).confirmation })
  })

  // adopting a packet that really arrived is covered by the REST test; this checks the tool's refusal per item
  test("adopt_discovered refuses a packet that was never seen", async () => {
    assert.match((await call("list_discovered", { miniserver: "haus" })).text, /no packets without a signal/)
    const missing = await json<Array<{ failed?: string }>>("adopt_discovered", { miniserver: "haus", packets: [{ packetId: "nope" }] })
    assert.equal(missing[0]!.failed, "nope")
  })

  test("delete needs the confirmation from a first call, for the same signals", async () => {
    const typo = await call("delete_loxone_signals", { signals: ["loxone/haus/out/dor"] })
    assert.deepEqual([typo.isError, /not found/.test(typo.text)], [true, true], "a typo is a refusal the agent can fix, not an internal error")
    const first = await json<{ needsConfirmation: boolean; summary: string; confirmation: string }>("delete_loxone_signals", { signals: ["loxone/haus/out/door"] })
    assert.equal(first.needsConfirmation, true)
    assert.match(first.summary, /deletes 1 Loxone signal \(loxone\/haus\/out\/door\), 0 wires/)
    assert.equal((await signals()).length, 2, "nothing deleted yet")
    const other = await call("delete_loxone_signals", { signals: ["loxone/haus/in/kellertur-temperature"], confirmation: first.confirmation })
    assert.ok(other.isError, "a confirmation is for the signals it named, and a wrong try uses it up")
    const again = await json<{ confirmation: string }>("delete_loxone_signals", { signals: ["loxone/haus/out/door"] })
    const done = await json<Array<{ ok?: string }>>("delete_loxone_signals", { signals: ["loxone/haus/out/door"], confirmation: again.confirmation })
    assert.deepEqual(done, [{ ok: "loxone/haus/out/door" }])
    assert.deepEqual((await signals()).map(signal => signal.packetId), ["temp"])
    assert.ok((await call("delete_loxone_signals", { signals: ["loxone/haus/out/door"], confirmation: again.confirmation })).isError, "used once")
  })
})
