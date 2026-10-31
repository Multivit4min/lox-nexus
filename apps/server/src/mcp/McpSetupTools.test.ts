import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import type { CreatedAccessTokenDto, PluginInstanceDto } from "@lox-nexus/api"
import { FakePluginTransport } from "@lox-nexus/core/testing"
import { Plugin, secret, z } from "@lox-nexus/plugin-sdk"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import type { ApiClient } from "../test-support/ApiClient.ts"
import { HomePlugin } from "../test-support/HomePlugin.ts"
import { TestApp } from "../test-support/TestApp.ts"

// a plugin that can't run without a token, like Home Assistant
class TokenPlugin extends Plugin<{ url: string; token: string }> {
  static readonly config = z.object({ url: z.url(), token: secret(z.string().min(1)) })
}

describe("MCP setup tools", { timeout: 30_000 }, () => {
  let app: TestApp
  let admin: ApiClient
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
  const confirmed = async <T>(name: string, args: Record<string, unknown>) => {
    const first = await json<{ needsConfirmation: boolean; confirmation: string; summary: string }>(name, args)
    assert.equal(first.needsConfirmation, true)
    return { summary: first.summary, result: await json<T>(name, { ...args, confirmation: first.confirmation }) }
  }

  before(async () => {
    const transport = new FakePluginTransport().add("home.ts", HomePlugin).add("token.ts", TokenPlugin)
    const [home, tokens] = [await PluginTestHost.describe(HomePlugin), await PluginTestHost.describe(TokenPlugin)]
    app = await TestApp.start({ pluginTransport: transport }, {}, nexus => {
      nexus.pluginCatalog.setDevelopment({ pkg: { id: "home", name: "Home", entry: "home.ts", description: home }, version: "1.0.0" })
      nexus.pluginCatalog.setDevelopment({ pkg: { id: "tokened", name: "Tokened", entry: "token.ts", description: tokens }, version: "1.0.0" })
    })
    admin = await app.admin()
    token = (await admin.post("/api/tokens", { currentPassword: "correct horse", name: "agent", scopes: ["configure"] })).json<CreatedAccessTokenDto>().token
  })
  after(() => app.dispose())

  test("Miniservers: create without a password, change one field, stop and delete after confirming", async () => {
    const withPassword = await call("create_miniserver", { slug: "haus", label: "Haus", host: "127.0.0.1", ownId: "nexus", remoteId: "ms", password: "planted-pw", enabled: false })
    assert.ok(withPassword.isError, "a password is never taken from an agent")
    const created = await json<{ slug: string; page: string; encrypted: boolean }>("create_miniserver", { slug: "haus", label: "Haus", host: "127.0.0.1", ownId: "nexus", remoteId: "ms", enabled: false })
    assert.deepEqual([created.slug, created.encrypted], ["haus", false])
    assert.match(created.page, /^#\/miniservers\//)
    const updated = await json<{ label: string; host: string; ownId: string }>("update_miniserver", { miniserver: "haus", label: "House" })
    assert.deepEqual([updated.label, updated.host, updated.ownId], ["House", "127.0.0.1", "nexus"], "the rest stays")
    const stop = await confirmed<{ running: boolean }>("stop_miniserver", { miniserver: "haus" })
    assert.match(stop.summary, /values stop flowing/)
    const removed = await confirmed<{ deleted: string }>("delete_miniserver", { miniserver: "haus" })
    assert.match(removed.summary, /0 Loxone signals/)
    assert.equal(removed.result.deleted, "haus")
  })

  test("a plugin instance needing a secret is saved without starting; the user's save starts it", async () => {
    assert.ok((await call("create_plugin_instance", { plugin: "tokened", slug: "ha", label: "HA", config: { url: "http://ha.local", token: "planted-token" } })).isError, "no secret from the agent")
    const activity = await admin.get("/api/tokens/activity?limit=5")
    assert.ok(!activity.body.includes("planted-token"), "nor in the audit, though the call was refused")
    const [refused] = activity.json<Array<{ tool: string; outcome: string; input: string; tokenName: string }>>()
    assert.deepEqual([refused?.tool, refused?.outcome, refused?.tokenName], ["create_plugin_instance", "refused", "agent"])
    assert.match(refused!.input, /"token":"‹secret›"/)
    const wrong = await call("create_plugin_instance", { plugin: "tokened", slug: "ha", label: "HA", config: { url: "not a url" } })
    assert.deepEqual([wrong.isError, /url/.test(wrong.text)], [true, true], "other problems are refused with the plugin's reasons")
    const created = await json<{ state: string; missingSecrets: string[]; page: string }>("create_plugin_instance", { plugin: "tokened", slug: "ha", label: "HA", config: { url: "http://ha.local" } })
    assert.deepEqual([created.state, created.missingSecrets], ["stopped", ["token"]])
    const instance = (await admin.get("/api/plugin-instances")).json<PluginInstanceDto[]>().find(entry => entry.slug === "ha")!
    const saved = await admin.put(`/api/plugin-instances/${instance.id}`, { plugin: "tokened", slug: "ha", label: "HA", config: { url: "http://ha.local", token: "planted-token" } })
    assert.equal(saved.json<PluginInstanceDto>().state, "running", saved.body)
    const renamed = await json<{ label: string; secretsSet: string[]; state: string }>("update_plugin_instance", { instance: "ha", label: "Home Assistant" })
    assert.deepEqual([renamed.label, renamed.secretsSet, renamed.state], ["Home Assistant", ["token"], "running"], "the stored token stays")
    const check = await json<{ issues: Array<{ path: string[] }> }>("check_plugin_settings", { plugin: "ha", config: { url: "nope" } })
    assert.deepEqual(check.issues.map(issue => issue.path), [["url"]], "an instance's check fills in its stored token")
    assert.equal((await json<{ state: string }>("plugin_instance_lifecycle", { instance: "ha", action: "stop" })).state, "stopped")
    assert.equal((await json<{ state: string }>("plugin_instance_lifecycle", { instance: "ha", action: "restart" })).state, "running")
    const removed = await confirmed<{ deleted: string }>("delete_plugin_instance", { instance: "ha" })
    assert.match(removed.summary, /tokened instance "Home Assistant" \(ha\) with 0 signals/)
    assert.match((await call("discover_setting", { plugin: "tokened", field: "url" })).text, /not found/)
  })

  test("plugin signals: added item by item without secrets, changed in part, deleted after confirming", async () => {
    await json("create_plugin_instance", { plugin: "home", slug: "home", label: "Home" })
    const added = await json<Array<{ ok?: string; failed?: string; error?: string }>>("add_plugin_signals", { instance: "home", signals: [
      { kind: "sensor", capability: "reading", params: { entity: "sensor.kitchen" }, label: "Kitchen", unit: "°C" },
      { kind: "sensor", capability: "reading", params: { entity: "sensor.door", apiKey: "planted-key" }, label: "Door" }
    ] })
    assert.equal(added[0]!.ok, "home/home/sensor/kitchen")
    assert.match(added[1]!.error!, /apiKey/)
    const updated = await json<{ topic: string; label: string; params: unknown }>("update_plugin_signal", { signal: "home/home/sensor/kitchen", label: "Kitchen temperature", params: { entity: "sensor.kitchen_2" } })
    assert.deepEqual([updated.topic, updated.label, updated.params], ["home/home/sensor/kitchen", "Kitchen temperature", { entity: "sensor.kitchen_2" }])
    const removed = await confirmed<Array<{ ok?: string }>>("delete_plugin_signals", { signals: ["home/home/sensor/kitchen"] })
    assert.deepEqual(removed.result, [{ ok: "home/home/sensor/kitchen" }])
  })
})
