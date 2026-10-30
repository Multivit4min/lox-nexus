import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import { SignalDisplayInputSchema, type ConfigExport, type LoxoneSignalDto, type MiniserverDto, type PluginInstanceDto, type PluginSignalDto, type SignalDto } from "@lox-nexus/api"
import { SignalDisplaySchema } from "@lox-nexus/core"
import { CounterPlugin, FakePluginTransport } from "@lox-nexus/core/testing"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import type { ApiClient } from "../../test-support/ApiClient.ts"
import { TestApp } from "../../test-support/TestApp.ts"

describe("a signal's unit and decimals", { timeout: 10_000 }, () => {
  let app: TestApp
  let admin: ApiClient

  before(async () => {
    const description = await PluginTestHost.describe(CounterPlugin)
    // as if the sensor class declared `static unit = "W"` and `static decimals = 1`
    description.sensors[0] = { ...description.sensors[0]!, unit: "W", decimals: 1, staleAfterMin: 5 }
    const pluginTransport = new FakePluginTransport().add("counter.ts", CounterPlugin)
    app = await TestApp.start({ pluginTransport }, {}, nexus =>
      nexus.pluginCatalog.setDevelopment({ pkg: { id: "counter", name: "Counter", entry: "counter.ts", description }, version: "1.0.0" }))
    admin = await app.admin()
  })
  after(() => app.dispose())

  const signal = async (id: string) => (await admin.get("/api/signals")).json<SignalDto[]>().find(s => s.id === id)

  test("a Loxone signal keeps them through an update, an empty unit is none, and the export carries them", async () => {
    const ms = (await admin.post("/api/miniservers", {
      slug: "haus", label: "Haus", host: "127.0.0.1", port: 7777, listenPort: 7000, ownId: "nexus", remoteId: "ms", enabled: false
    })).json<MiniserverDto>()
    const base = `/api/miniservers/${ms.id}/signals`
    const created = (await admin.post(base, { packetId: "temp", direction: "in", dataType: 1, label: "Temperature", unit: " °C ", decimals: 1 })).json<LoxoneSignalDto>()
    assert.deepEqual([created.unit, created.decimals], ["°C", 1])
    assert.deepEqual([(await signal(created.id))?.unit, (await signal(created.id))?.decimals], ["°C", 1], "wires and lists see them too")
    assert.equal((await admin.post(base, { packetId: "x", direction: "in", dataType: 1, label: "X", decimals: 7 })).statusCode, 400)
    const cleared = (await admin.put(`${base}/${created.id}`, { packetId: "temp", direction: "in", dataType: 1, label: "Temperature", unit: "", decimals: 2 })).json<LoxoneSignalDto>()
    assert.deepEqual([cleared.unit, cleared.decimals], [undefined, 2])
    await admin.put(`${base}/${created.id}`, { packetId: "temp", direction: "in", dataType: 1, label: "Temperature", unit: "K", decimals: 0, staleAfterMin: 10 })
    const output = (await admin.post(base, { packetId: "pump", direction: "out", dataType: 1, label: "Pump", staleAfterMin: 10 })).json<LoxoneSignalDto>()
    assert.equal(output.staleAfterMin, undefined, "an output never goes stale, so it keeps no limit")
    await admin.delete(`${base}/${output.id}`)
    const exported = (await admin.get("/api/config/export")).json<ConfigExport>()
    const stored = exported.miniservers[0]?.signals[0]
    assert.deepEqual([stored?.unit, stored?.decimals, stored?.staleAfterMin], ["K", 0, 10])
    await admin.put(`${base}/${created.id}`, { packetId: "temp", direction: "in", dataType: 1, label: "Temperature" })
    const imported = await admin.post("/api/config/import", exported)
    assert.equal(imported.statusCode, 200, imported.body)
    const restored = (await admin.get(base)).json<LoxoneSignalDto[]>()[0]
    assert.deepEqual([restored?.unit, restored?.decimals, restored?.staleAfterMin], ["K", 0, 10], "an import restores them")
  })

  test("the browser's copy of the rules accepts exactly what the server's does", () => {
    for (const value of [{}, { unit: "" }, { unit: "  W " }, { unit: "x".repeat(16) }, { unit: "x".repeat(17) }, { decimals: -1 }, { decimals: 0 }, { decimals: 6 }, { decimals: 7 }, { decimals: 1.5 }, { decimals: "2" }]) {
      const [server, browser] = [SignalDisplaySchema.safeParse(value), SignalDisplayInputSchema.safeParse(value)]
      assert.deepEqual([browser.success, browser.data], [server.success, server.data], JSON.stringify(value))
    }
  })

  test("a new plugin signal takes its class's suggestion unless it says otherwise; both are stored", async () => {
    const instance = (await admin.post("/api/plugin-instances", { plugin: "counter", slug: "home", label: "Home" })).json<PluginInstanceDto>()
    const base = `/api/plugin-instances/${instance.id}/signals`
    const suggested = (await admin.post(base, { kind: "sensor", capability: "value", params: { start: 1 }, label: "Power" })).json<PluginSignalDto>()
    assert.deepEqual([suggested.unit, suggested.decimals, suggested.staleAfterMin], ["W", 1, 5])
    const cleared = (await admin.post(base, { kind: "sensor", capability: "value", params: { start: 1 }, label: "Plain", unit: "", decimals: null, staleAfterMin: null })).json<PluginSignalDto>()
    assert.deepEqual([cleared.unit, cleared.decimals, cleared.staleAfterMin], [undefined, undefined, undefined], "a form that cleared the suggestions keeps them cleared")
    const fromCatalog = (await admin.post(base, { kind: "sensor", capability: "value", params: { start: 1 }, label: "Grid", unit: "kW" })).json<PluginSignalDto>()
    assert.deepEqual([fromCatalog.unit, fromCatalog.decimals, fromCatalog.staleAfterMin], ["kW", 1, 5], "a catalog entry's unit; the rest is suggested")
    const actuator = (await admin.post(base, { kind: "actuator", capability: "set", params: {}, label: "Set", staleAfterMin: 3 })).json<PluginSignalDto>()
    assert.equal(actuator.staleAfterMin, undefined, "an actuator never goes stale")
    const own = (await admin.post(base, { kind: "sensor", capability: "value", params: { start: 1 }, label: "Energy", unit: "kWh", decimals: 3 })).json<PluginSignalDto>()
    assert.deepEqual([own.unit, own.decimals], ["kWh", 3])
    const edited = (await admin.put(`${base}/${suggested.id}`, { kind: "sensor", capability: "value", params: { start: 1 }, label: "Power" })).json<PluginSignalDto>()
    assert.deepEqual([edited.unit, edited.decimals], [undefined, undefined], "an edit stores what it sends; the suggestion is only for new signals")
    const stored = app.app.persistence.pluginSignals.listFor(instance.id).map(row => [row.label, row.unit, row.decimals])
    assert.deepEqual(stored, [["Energy", "kWh", 3], ["Grid", "kW", 1], ["Plain", undefined, undefined], ["Power", undefined, undefined], ["Set", undefined, undefined]])
  })
})
