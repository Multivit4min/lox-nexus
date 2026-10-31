import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import type { PluginInstanceDto, PluginLogLineDto, PluginStoreClearedDto, PluginStoreEntryDto, PluginStoreValueDto } from "@lox-nexus/api"
import { FakePluginTransport } from "@lox-nexus/core/testing"
import { Plugin } from "@lox-nexus/plugin-sdk"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import type { ApiClient } from "../../test-support/ApiClient.ts"
import { TestApp } from "../../test-support/TestApp.ts"

// counts its starts in the store, and writes once more while stopping, as a plugin flushing its state would
class CountingPlugin extends Plugin {
  override start() {
    this.store.set("starts", (this.store.get<number>("starts") ?? 0) + 1)
    this.store.set("device", { name: "Kitchen", ids: [1, 2, 3] })
    this.onDispose(() => this.store.set("stopped", true))
  }
}

describe("plugin stored data API", { timeout: 20_000 }, () => {
  let app: TestApp
  let admin: ApiClient
  let instance: PluginInstanceDto
  const url = (path = "") => `/api/plugin-instances/${instance.id}/store${path}`
  const entries = async () => (await admin.get(url())).json<PluginStoreEntryDto[]>()
  const settled = async (check: (keys: string[]) => boolean) => {
    for (let i = 0; i < 100 && !check((await entries()).map(entry => entry.key)); i++) await new Promise(resolve => setImmediate(resolve))
  }

  before(async () => {
    const description = await PluginTestHost.describe(CountingPlugin)
    const pluginTransport = new FakePluginTransport().add("counting.ts", CountingPlugin)
    app = await TestApp.start({ pluginTransport }, {}, nexus =>
      nexus.pluginCatalog.setDevelopment({ pkg: { id: "counting", name: "Counting", entry: "counting.ts", description }, version: "1.0.0" }))
    admin = await app.admin()
    instance = (await admin.post("/api/plugin-instances", { plugin: "counting", slug: "home", label: "Home" })).json<PluginInstanceDto>()
    await settled(keys => keys.includes("device"))
  })
  after(() => app.dispose())

  test("lists every key with its size and reads one value; unknown keys and instances are 404", async () => {
    assert.deepEqual(await entries(), [{ key: "device", bytes: 32 }, { key: "starts", bytes: 1 }])
    assert.deepEqual((await admin.get(url("/device"))).json<PluginStoreValueDto>(), { key: "device", value: { name: "Kitchen", ids: [1, 2, 3] } })
    assert.equal((await admin.get(url("/nothing"))).statusCode, 404)
    assert.equal((await admin.get("/api/plugin-instances/unknown/store")).statusCode, 404)
  })

  test("clearing stops the plugin, wipes everything (also what it wrote while stopping) and starts it on an empty store", async () => {
    await admin.post(`/api/plugin-instances/${instance.id}/stop`)
    await admin.post(`/api/plugin-instances/${instance.id}/start`)
    await settled(keys => keys.includes("stopped"))
    assert.deepEqual((await admin.get(url("/starts"))).json<PluginStoreValueDto>().value, 2)
    const answer = await admin.delete(url())
    assert.equal(answer.statusCode, 200, answer.body)
    const { cleared, instance: restarted } = answer.json<PluginStoreClearedDto>()
    assert.deepEqual([cleared, restarted.state], [3, "running"])
    await settled(keys => keys.includes("device"))
    assert.deepEqual((await entries()).map(entry => entry.key), ["device", "starts"], '"stopped" from before the wipe is gone')
    assert.equal((await admin.get(url("/starts"))).json<PluginStoreValueDto>().value, 1, "the plugin started over")
    const lines = (await admin.get(`/api/plugin-instances/${instance.id}/logs`)).json<PluginLogLineDto[]>()
    assert.ok(lines.some(line => /stored data cleared by admin \(3 keys\)/.test(line.message)))
  })

  test("a stopped instance is wiped and stays stopped", async () => {
    await admin.post(`/api/plugin-instances/${instance.id}/stop`)
    const { cleared, instance: stopped } = (await admin.delete(url())).json<PluginStoreClearedDto>()
    assert.equal(stopped.state, "stopped")
    assert.ok(cleared > 0)
    assert.deepEqual(await entries(), [])
  })
})
