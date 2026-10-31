import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import type { CreatedAccessTokenDto } from "@lox-nexus/api"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { TestApp } from "../test-support/TestApp.ts"

describe("MCP read tools", { timeout: 30_000 }, () => {
  let app: TestApp
  let token: string
  let call: (name: string, args?: Record<string, unknown>) => Promise<{ text: string; isError?: boolean }>
  const json = async <T>(name: string, args?: Record<string, unknown>) => JSON.parse((await call(name, args)).text) as T

  before(async () => {
    app = await TestApp.start()
    const admin = await app.admin()
    const ms = (await admin.post("/api/miniservers", { slug: "haus", label: "Haus", host: "127.0.0.1", port: 7000, listenPort: 7001, ownId: "nexus", remoteId: "ms", enabled: false })).json<{ id: string }>()
    const input = (await admin.post(`/api/miniservers/${ms.id}/signals`, { packetId: "temp", direction: "in", dataType: 1, label: "Temperature", unit: "°C" })).json<{ id: string }>()
    const output = (await admin.post(`/api/miniservers/${ms.id}/signals`, { packetId: "heat", direction: "out", dataType: 0, label: "Heating" })).json<{ id: string }>()
    await admin.post("/api/wires", { label: "temp to heat", sourceId: input.id, targetId: output.id, transforms: [{ op: "convert", to: "boolean" }] })
    app.app.bus.publish("loxone/haus/in/temp", Value.number(21.5), { source: { kind: "loxone", id: ms.id } })
    await admin.post("/api/bus/forces", { topic: "loxone/haus/out/heat", value: Value.boolean(false), reason: "summer" })
    // a planted secret: no tool may ever show it
    await admin.post("/api/miniservers", { slug: "garage", label: "Garage", host: "127.0.0.2", port: 7000, listenPort: 7002, ownId: "nexus", remoteId: "ms2", password: "planted-secret-42", enabled: false })
    token = (await admin.post("/api/tokens", { currentPassword: "correct horse", name: "test agent", scopes: [] })).json<CreatedAccessTokenDto>().token
    let id = 0
    call = async (name, args = {}) => {
      const answer = await app.client().post("/mcp", { jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }, { authorization: `Bearer ${token}` })
      const { result } = answer.json<{ result: { content: { text: string }[]; isError?: boolean } }>()
      return { text: result.content[0]!.text, ...(result.isError ? { isError: true } : {}) }
    }
  })
  after(() => app.dispose())

  test("overview: Miniservers, wires, forces, problems, and the signal table with packet ids, data types and values", async () => {
    const overview = await json<Record<string, { columns: string[]; rows: unknown[][] } & Record<string, unknown>>>("overview", { signals: true })
    assert.deepEqual(overview.miniservers!.rows[0]!.slice(0, 2), ["haus", "Haus"])
    assert.deepEqual([overview.wires, overview.forces], [{ total: 1, inactive: 0 }, 1])
    const signals = overview.signals!
    const row = (topic: string) => Object.fromEntries(signals.columns.map((column, i) => [column, signals.rows.find(cells => cells[0] === topic)![i]]))
    assert.deepEqual([row("loxone/haus/in/temp").packetId, row("loxone/haus/in/temp").dataType, row("loxone/haus/in/temp").value, row("loxone/haus/in/temp").dir], ["temp", "Analog", "21.5 °C", "in"])
    assert.equal(row("loxone/haus/out/heat").flags, "forced")
  })

  test("list_signals filters and pages; get_signal shows the value, the force and the wires", async () => {
    const outs = await json<{ rows: unknown[][]; total: number }>("list_signals", { direction: "out" })
    assert.deepEqual([outs.total, outs.rows[0]![0]], [1, "loxone/haus/out/heat"])
    const first = await json<{ rows: unknown[][]; next?: string }>("list_signals", { limit: 1 })
    assert.equal(first.next, "1")
    const heat = await json<{ force: { by: string; reason: string }; wiresFrom: { other: string; transforms: number }[]; recent: string[] }>("get_signal", { signal: "loxone/haus/out/heat" })
    assert.deepEqual([heat.force.by, heat.force.reason], ["admin", "summer"])
    assert.deepEqual(heat.wiresFrom, [{ other: "loxone/haus/in/temp", label: "temp to heat", transforms: 1 }])
    assert.ok(heat.recent.length > 0)
    assert.deepEqual(await call("get_signal", { signal: "loxone/haus/nowhere" }), { text: "signal \"loxone/haus/nowhere\" (use list_signals to find its topic) not found", isError: true })
  })

  test("list_wires shows both ends as topics; recent_messages and trace explain the bus", async () => {
    const wires = await json<{ columns: string[]; rows: unknown[][] }>("list_wires")
    assert.deepEqual(wires.rows[0]!.slice(0, 4), ["temp to heat", "loxone/haus/in/temp", "loxone/haus/out/heat", "convert"])
    const recent = (await call("recent_messages", { pattern: "loxone/haus/in/#" })).text
    const id = recent.split("\n").at(-1)!.split(/\s+/)[0]!
    assert.match((await call("trace", { message: id })).text, /loxone\/haus\/in\/temp/)
    assert.equal((await call("trace", { message: "no-such-id" })).isError, true)
  })

  test("system_status names the version; invalid arguments come back as a readable tool error", async () => {
    assert.ok("version" in await json<Record<string, unknown>>("system_status") || "note" in await json<Record<string, unknown>>("system_status"))
    const invalid = await call("list_signals", { limit: 9999 })
    assert.equal(invalid.isError, true)
    assert.match(invalid.text, /limit/)
  })

  test("no read tool shows a stored secret", async () => {
    const outputs = await Promise.all([
      call("overview", { signals: true }), call("list_signals"), call("list_wires"), call("system_status"), call("recent_messages"),
      call("get_signal", { signal: "loxone/haus/in/temp" })
    ])
    for (const output of outputs) assert.ok(!output.text.includes("planted-secret-42"))
  })

  test("the official MCP client connects, lists the tools and resources, and reads the inventory", async () => {
    const client = new Client({ name: "conformance", version: "1.0.0" })
    await client.connect(new StreamableHTTPClientTransport(new URL(`${app.address}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } }))
    try {
      const tools = (await client.listTools()).tools.map(tool => tool.name).sort()
      assert.deepEqual(tools, ["get_signal", "list_signals", "list_wires", "overview", "recent_messages", "system_status", "trace"], "a read token sees the read tools")
      assert.deepEqual((await client.listResources()).resources.map(resource => resource.uri), ["nexus://inventory", "nexus://guide"])
      const inventory = await client.readResource({ uri: "nexus://inventory" })
      assert.match(JSON.stringify(inventory.contents), /loxone\/haus\/in\/temp/)
      const overview = await client.callTool({ name: "overview", arguments: {} })
      assert.equal(overview.isError, undefined)
    } finally {
      await client.close()
    }
  })
})
