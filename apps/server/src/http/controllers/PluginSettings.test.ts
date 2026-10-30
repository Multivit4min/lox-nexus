import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import type { PluginCheckDto, PluginInstanceDto } from "@lox-nexus/api"
import { FakePluginTransport } from "@lox-nexus/core/testing"
import { Plugin, secret, z } from "@lox-nexus/plugin-sdk"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import type { ApiClient } from "../../test-support/ApiClient.ts"
import { TestApp } from "../../test-support/TestApp.ts"

/** a device with a host and a token; version 2 renamed `address` to `host` and moved `rooms` into the store */
class Gateway extends Plugin<{ host: string; token: string }> {
  static readonly config = z.object({ host: z.string().min(1), token: secret(z.string().min(1)) })
  static readonly configVersion = 2
  static migrateConfig({ config, from, store }: { config: unknown; from: number; store: { set(key: string, value: unknown): void } }) {
    if (from >= 2) return config
    const { address, rooms, ...rest } = config as { address?: string; rooms?: string[] }
    if (rooms) store.set("rooms", rooms)
    return address ? { ...rest, host: address } : rest
  }

  static async test(config: { host: string; token: string }) {
    if (config.token !== "right") throw new Error(`${config.host} refused the token`)
    return `connected to ${config.host}`
  }
}

describe("plugin settings are checked before they are saved", { timeout: 10_000 }, () => {
  let app: TestApp
  let admin: ApiClient

  before(async () => {
    const description = await PluginTestHost.describe(Gateway)
    app = await TestApp.start({ pluginTransport: new FakePluginTransport().add("gateway.ts", Gateway) }, {}, nexus =>
      nexus.pluginCatalog.setDevelopment({ pkg: { id: "gateway", name: "Gateway", entry: "gateway.ts", description }, version: "1.0.0" }))
    admin = await app.admin()
  })
  after(() => app.dispose())

  test("invalid settings are refused with their fields; valid ones are stored with the plugin's config version", async () => {
    const refused = await admin.post("/api/plugin-instances", { plugin: "gateway", slug: "gw", label: "GW", config: { host: "", token: "right" } })
    assert.equal(refused.statusCode, 400)
    assert.deepEqual(refused.json<{ issues: Array<{ path: string[] }> }>().issues.map(issue => issue.path), [["config", "host"]])
    assert.equal((await admin.get("/api/plugin-instances")).json<PluginInstanceDto[]>().length, 0, "nothing was saved")
    const created = (await admin.post("/api/plugin-instances", { plugin: "gateway", slug: "gw", label: "GW", config: { host: "gw.local", token: "right" } })).json<PluginInstanceDto>()
    assert.equal(created.state, "running")
    assert.equal(app.app.persistence.pluginInstances.get(created.id)?.configVersion, 2)
  })

  test("the check route finds issues, tests the connection, and fills in an edit's stored secret", async () => {
    const check = async (body: object) => (await admin.post("/api/plugin-instances/check", body)).json<PluginCheckDto>()
    assert.deepEqual(await check({ plugin: "gateway", config: { host: "x" } }), { checked: true, issues: [{ path: ["token"], message: "Invalid input: expected string, received undefined" }] })
    assert.deepEqual(await check({ plugin: "gateway", config: { host: "x", token: "wrong" }, test: true }), { checked: true, issues: [], test: { ok: false, error: "x refused the token" } })
    const id = (await admin.get("/api/plugin-instances")).json<PluginInstanceDto[]>()[0]!.id
    assert.deepEqual(await check({ plugin: "gateway", config: { host: "gw.local" }, instanceId: id, test: true }), { checked: true, issues: [], test: { ok: true, message: "connected to gw.local" } })
  })

  test("an instance stored with an older config version is migrated when it starts, and stored so", async () => {
    const repo = app.app.persistence.pluginInstances
    repo.save({ id: "old", plugin: "gateway", slug: "old", label: "Old", config: { address: "old.local", token: "right" }, enabled: true })
    const supervisor = app.app.plugins.add(repo.get("old")!, app.app.pluginCatalog.get("gateway")!.pkg)
    await supervisor.start()
    for (let i = 0; i < 20 && repo.get("old")?.configVersion !== 2; i++) await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual([repo.get("old")?.config, repo.get("old")?.configVersion], [{ host: "old.local", token: "right" }, 2])
  })

  test("editing an old instance before its first start keeps what its migration moves into the store", async () => {
    const repo = app.app.persistence.pluginInstances
    repo.save({ id: "early", plugin: "gateway", slug: "early", label: "Early", config: { address: "old.local", token: "right", rooms: ["Hall"] }, configVersion: 1, enabled: false })
    app.app.plugins.add(repo.get("early")!, app.app.pluginCatalog.get("gateway")!.pkg)
    const saved = await admin.put("/api/plugin-instances/early", { plugin: "gateway", slug: "early", label: "Early", config: { host: "new.local" }, enabled: false })
    assert.equal(saved.statusCode, 200, saved.body)
    const stored = repo.get("early")! as { config: { host?: string; token?: string }; configVersion?: number }
    assert.deepEqual([stored.config.host, stored.config.token, stored.configVersion], ["new.local", "right", 2], "the form's host, the stored token, the current version")
    assert.deepEqual(app.app.persistence.pluginStore.load("early"), { rooms: ["Hall"] }, "what only the migration moves is in the store")
  })
})
