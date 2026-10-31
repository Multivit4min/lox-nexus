import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import type { PluginInstanceDto, PluginSignalDto } from "@lox-nexus/api"
import { FakePluginTransport } from "@lox-nexus/core/testing"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import type { ApiClient } from "../test-support/ApiClient.ts"
import { HomePlugin } from "../test-support/HomePlugin.ts"
import { TestApp } from "../test-support/TestApp.ts"

const SECRET = "planted-signal-secret"

describe("secret signal params", { timeout: 30_000 }, () => {
  let app: TestApp
  let admin: ApiClient
  let instance: PluginInstanceDto
  let signal: PluginSignalDto
  const base = () => `/api/plugin-instances/${instance.id}/signals`
  const stored = () => app.app.persistence.pluginSignals.listFor(instance.id).find(entry => entry.id === signal.id)?.params

  before(async () => {
    const description = await PluginTestHost.describe(HomePlugin)
    app = await TestApp.start({ pluginTransport: new FakePluginTransport().add("home.ts", HomePlugin) }, {}, nexus =>
      nexus.pluginCatalog.setDevelopment({ pkg: { id: "home", name: "Home", entry: "home.ts", description }, version: "1.0.0" }))
    admin = await app.admin()
    instance = (await admin.post("/api/plugin-instances", { plugin: "home", slug: "ha", label: "HA" })).json<PluginInstanceDto>()
    const added = await admin.post(base(), { kind: "sensor", capability: "reading", params: { entity: "sensor.door", apiKey: SECRET }, label: "Door" })
    assert.equal(added.statusCode, 201, added.body)
    signal = added.json<PluginSignalDto>()
  })
  after(() => app.dispose())

  test("answers name a secret param but never show it", async () => {
    assert.deepEqual([signal.params, signal.secrets], [{ entity: "sensor.door" }, ["apiKey"]])
    assert.ok(!(await admin.get(base())).body.includes(SECRET))
    assert.deepEqual(stored(), { entity: "sensor.door", apiKey: SECRET })
  })

  test("an edit that leaves it out keeps it; one that gives it replaces it", async () => {
    const edited = await admin.put(`${base()}/${signal.id}`, { kind: "sensor", capability: "reading", params: { entity: "sensor.gate" }, label: "Gate" })
    assert.equal(edited.statusCode, 200, edited.body)
    assert.deepEqual(stored(), { entity: "sensor.gate", apiKey: SECRET })
    await admin.put(`${base()}/${signal.id}`, { kind: "sensor", capability: "reading", params: { entity: "sensor.gate", apiKey: "new-key" }, label: "Gate" })
    assert.deepEqual(stored(), { entity: "sensor.gate", apiKey: "new-key" })
    await admin.put(`${base()}/${signal.id}`, { kind: "sensor", capability: "reading", params: { entity: "sensor.gate", apiKey: SECRET }, label: "Gate" })
  })

  test("a plain export leaves it out; a sealed one carries it, and an import puts it back", async () => {
    const plain = await admin.get("/api/config/export")
    assert.ok(!plain.body.includes(SECRET), "the plain export is free of secrets")
    assert.ok(plain.body.includes("sensor.gate"), "the other params stay")
    const sealed = (await admin.post("/api/config/export", { passphrase: "long enough passphrase" })).json<Record<string, unknown>>()
    assert.ok(!JSON.stringify(sealed).includes(SECRET))
    await admin.delete(`${base()}/${signal.id}`)
    const imported = await admin.post("/api/config/import", { file: sealed, passphrase: "long enough passphrase" })
    assert.equal(imported.statusCode, 200, imported.body)
    assert.deepEqual(stored(), { entity: "sensor.gate", apiKey: SECRET })
  })

  test("importing the plain export keeps the secret of the signal with the same id", async () => {
    const plain = (await admin.get("/api/config/export")).json<Record<string, unknown>>()
    assert.equal((await admin.post("/api/config/import", plain)).statusCode, 200)
    assert.deepEqual(stored(), { entity: "sensor.gate", apiKey: SECRET })
  })
})
