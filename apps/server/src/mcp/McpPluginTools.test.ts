import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import type { CreatedAccessTokenDto, PluginInstanceDto } from "@lox-nexus/api"
import { FakePluginTransport } from "@lox-nexus/core/testing"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { HomePlugin } from "../test-support/HomePlugin.ts"
import { TestApp } from "../test-support/TestApp.ts"

describe("MCP plugin tools", { timeout: 30_000 }, () => {
  let app: TestApp
  let token: string
  let id = 0
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const answer = await app.client().post("/mcp", { jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }, { authorization: `Bearer ${token}` })
    const { result } = answer.json<{ result: { content: { text: string }[]; isError?: boolean } }>()
    return { text: result.content[0]!.text, ...(result.isError ? { isError: true } : {}) }
  }
  const json = async <T>(name: string, args?: Record<string, unknown>) => {
    const answer = await call(name, args)
    assert.ok(!answer.isError, answer.text)
    assert.ok(!answer.text.includes("planted"), `${name} shows a secret`)
    return JSON.parse(answer.text) as T
  }

  before(async () => {
    const description = await PluginTestHost.describe(HomePlugin)
    const pluginTransport = new FakePluginTransport().add("home.ts", HomePlugin)
    app = await TestApp.start({ pluginTransport }, {}, nexus =>
      nexus.pluginCatalog.setDevelopment({ pkg: { id: "home", name: "Home", entry: "home.ts", description }, version: "1.0.0" }))
    const admin = await app.admin()
    const instance = (await admin.post("/api/plugin-instances", { plugin: "home", slug: "ha", label: "HA" })).json<PluginInstanceDto>()
    await admin.post(`/api/plugin-instances/${instance.id}/start`, {})
    await admin.post("/api/miniservers", { slug: "haus", label: "Haus", host: "127.0.0.1", port: 7000, listenPort: 7001, ownId: "nexus", remoteId: "ms", enabled: false })
    token = (await admin.post("/api/tokens", { currentPassword: "correct horse", name: "agent", scopes: ["configure"] })).json<CreatedAccessTokenDto>().token
  })
  after(() => app.dispose())

  test("describe_plugin: settings with the secret fields named, capabilities and instances", async () => {
    const plugin = await json<{ id: string; secretFields: string[]; sensors: Array<{ id: string }>; instances: Array<{ slug: string }> }>("describe_plugin", { plugin: "ha" })
    assert.equal(plugin.id, "home")
    assert.deepEqual(plugin.secretFields, ["token"])
    assert.deepEqual(plugin.sensors.map(sensor => sensor.id), ["reading"])
    assert.deepEqual(plugin.instances.map(instance => instance.slug), ["ha"])
    assert.match((await call("describe_plugin", { plugin: "nope" })).text, /installed: home/)
  })

  test("search_catalog finds entries by words, with their value, and never a secret param", async () => {
    const found = await json<{ columns: string[]; rows: unknown[][]; total: number }>("search_catalog", { instance: "ha", query: "kitchen temp" })
    assert.equal(found.total, 1)
    const row = Object.fromEntries(found.columns.map((column, i) => [column, found.rows[0]![i]]))
    assert.equal(row.path, "Kitchen")
    assert.equal(row.value, "21.5 °C")
    const garage = await json<{ columns: string[]; rows: unknown[][] }>("search_catalog", { instance: "ha", query: "garage" })
    assert.ok(JSON.stringify(garage.rows).includes("sensor.door"))
    assert.equal((await json<{ total: number }>("search_catalog", { instance: "ha", kind: "actuator" })).total, 1)
  })

  test("plan_bridge suggests the Loxone side; bridge creates it; loxone_side then lists it", async () => {
    const entries = [
      { entry: { kind: "sensor", capability: "reading", params: { entity: "sensor.kitchen_temperature" }, label: "Kitchen temperature" } },
      { entry: { kind: "actuator", capability: "switch", params: { entity: "switch.kitchen_light" }, label: "Kitchen light" } }
    ]
    const plan = await json<{ items: Array<{ plugin: unknown; loxone: { packetId: string; dataType: number } }>; notes: Array<{ dataTypeName: string }> }>("plan_bridge", { instance: "ha", miniserver: "haus", items: entries })
    assert.deepEqual(plan.items.map(item => item.loxone.dataType), [1, 0])
    assert.deepEqual(plan.notes.map(note => note.dataTypeName), ["Analog", "Digital"])
    assert.equal(new Set(plan.items.map(item => item.loxone.packetId)).size, 2)
    const results = await json<Array<{ ok: boolean; plugin?: string; loxone?: string; error?: string }>>("bridge", { instance: "ha", miniserver: "haus", items: plan.items })
    assert.ok(results.every(result => result.ok), JSON.stringify(results))
    assert.deepEqual(results.map(result => result.loxone), ["loxone/haus/out/kitchen-temperature", "loxone/haus/in/kitchen-light"])
    const side = await json<{ objects: Array<{ topic: string; loxone: { object: string }; feeds?: string }> }>("loxone_side", { miniserver: "haus" })
    const temperature = side.objects.find(object => object.topic === "loxone/haus/out/kitchen-temperature")!
    assert.equal(temperature.loxone.object, "intercommunication input")
    assert.equal(temperature.feeds, results[0]!.plugin)
    const again = await json<{ notes: Array<{ alreadyConnectedTo?: string[] }> }>("plan_bridge", { instance: "ha", miniserver: "haus", items: [{ signal: results[0]!.plugin }] })
    assert.deepEqual(again.notes[0]!.alreadyConnectedTo, [plan.items[0]!.loxone.packetId])
  })
})
