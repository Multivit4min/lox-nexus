import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import type { AccessScope, CreatedAccessTokenDto, PluginInstanceDto } from "@lox-nexus/api"
import { FakePluginTransport } from "@lox-nexus/core/testing"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { HomePlugin } from "../test-support/HomePlugin.ts"
import { TestApp } from "../test-support/TestApp.ts"

describe("MCP operate tools", { timeout: 30_000 }, () => {
  let app: TestApp
  let tokens: Record<"configure" | "operate", string>
  let id = 0
  const call = async (name: string, args: Record<string, unknown> = {}, token = tokens.operate) => {
    const answer = await app.client().post("/mcp", { jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }, { authorization: `Bearer ${token}` })
    const body = answer.json<{ result?: { content: { text: string }[]; isError?: boolean }; error?: { message: string } }>()
    if (!body.result) return { text: body.error!.message, isError: true }
    return { text: body.result.content[0]!.text, ...(body.result.isError ? { isError: true } : {}) }
  }
  const json = async <T>(name: string, args?: Record<string, unknown>) => {
    const answer = await call(name, args)
    assert.ok(!answer.isError, answer.text)
    return JSON.parse(answer.text) as T
  }

  before(async () => {
    HomePlugin.switched.length = 0
    const description = await PluginTestHost.describe(HomePlugin)
    app = await TestApp.start({ pluginTransport: new FakePluginTransport().add("home.ts", HomePlugin) }, {}, nexus =>
      nexus.pluginCatalog.setDevelopment({ pkg: { id: "home", name: "Home", entry: "home.ts", description }, version: "1.0.0" }))
    const admin = await app.admin()
    const instance = (await admin.post("/api/plugin-instances", { plugin: "home", slug: "ha", label: "HA" })).json<PluginInstanceDto>()
    await admin.post(`/api/plugin-instances/${instance.id}/start`, {})
    await admin.post(`/api/plugin-instances/${instance.id}/signals`, { kind: "actuator", capability: "switch", params: { entity: "switch.lamp" }, label: "Lamp" })
    const ms = (await admin.post("/api/miniservers", { slug: "haus", label: "Haus", host: "127.0.0.1", port: 7000, listenPort: 7001, ownId: "nexus", remoteId: "ms", enabled: false })).json<{ id: string }>()
    await admin.post(`/api/miniservers/${ms.id}/signals`, { packetId: "heat", direction: "out", dataType: 0, label: "Heating" })
    const token = async (scopes: AccessScope[]) => (await admin.post("/api/tokens", { currentPassword: "correct horse", name: "agent", scopes })).json<CreatedAccessTokenDto>().token
    tokens = { configure: await token(["configure"]), operate: await token(["operate"]) }
  })
  after(() => app.dispose())

  test("only an operate token may act on the house", async () => {
    assert.match((await call("force", { signal: "loxone/haus/out/heat", value: true, reason: "test" }, tokens.configure)).text, /unknown tool force/)
  })

  test("force needs a reason, takes the signal's type, expires within 24 h and names the agent; release ends it", async () => {
    assert.ok((await call("force", { signal: "loxone/haus/out/heat", value: true })).isError, "a reason is required")
    assert.match((await call("force", { signal: "loxone/haus/out/heat", value: 21.5, reason: "test" })).text, /takes boolean values, not number/)
    assert.ok((await call("force", { signal: "loxone/haus/out/heat", value: true, reason: "test", minutes: 2000 })).isError, "at most 24 h")
    const before = Date.now()
    const forced = await json<{ forced: string; until: string }>("force", { signal: "loxone/haus/out/heat", value: true, reason: "frost test", minutes: 30 })
    assert.equal(forced.forced, "loxone/haus/out/heat")
    assert.ok(Math.abs(Date.parse(forced.until) - before - 30 * 60_000) < 5000)
    const [force] = app.app.bus.activeForces()
    assert.deepEqual([force?.by, force?.reason], ["admin via MCP (agent)", "frost test"])
    assert.deepEqual(await json("release", { signal: "loxone/haus/out/heat" }), { released: "loxone/haus/out/heat" })
    assert.equal(app.app.bus.activeForces().length, 0)
    assert.ok((await call("release", { signal: "loxone/haus/out/heat" })).isError, "nothing left to release")
  })

  test("inject on an actuator is a command the device acts on", async () => {
    const switched = new Promise(resolve => HomePlugin.events.once("switched", resolve))
    const sent = await json<{ kind: string }>("inject", { signal: "home/ha/actuator/lamp", value: true })
    assert.equal(sent.kind, "command")
    assert.equal(await switched, true)
    assert.deepEqual(app.app.bus.current("home/ha/actuator/lamp")?.value ?? app.app.bus.lastCommand("home/ha/actuator/lamp")?.value, Value.boolean(true))
  })

  test("run_plugin_action: plain actions run at once; one that asks first needs the confirmation; QR payloads stay out", async () => {
    assert.deepEqual(await json("run_plugin_action", { instance: "ha", action: "refresh", input: { entity: "light.kitchen" } }), { action: "refresh", message: "refreshed light.kitchen" })
    assert.ok((await call("run_plugin_action", { instance: "ha", action: "refresh", input: {} })).isError, "the plugin checks the input")
    const first = await json<{ needsConfirmation: boolean; summary: string; confirmation: string }>("run_plugin_action", { instance: "ha", action: "pair" })
    assert.deepEqual([first.needsConfirmation, first.summary], [true, "HA: Open a pairing window for 3 minutes?"])
    const paired = await call("run_plugin_action", { instance: "ha", action: "pair", confirmation: first.confirmation })
    assert.ok(!paired.isError, paired.text)
    assert.match(paired.text, /pairing code 3497-011-2332/)
    assert.ok(!paired.text.includes("planted"), "the QR payload is only in the web UI")
    assert.match((await call("run_plugin_action", { instance: "ha", action: "nope" })).text, /it has: refresh, pair/)
  })
})
