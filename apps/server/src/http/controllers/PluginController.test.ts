import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import type { PluginInstanceDto, PluginPackageDto, PluginSignalDto } from "@lox-nexus/api"
import { CounterPlugin, FakePluginTransport } from "@lox-nexus/core/testing"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { ApiClient } from "../../test-support/ApiClient.ts"
import { TestApp } from "../../test-support/TestApp.ts"

/** waits for queued fake-worker messages (microtasks and immediates) to be handled */
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve))
}

describe("plugin API", { timeout: 10_000 }, () => {
  let app: TestApp
  let admin: ApiClient
  let instance: PluginInstanceDto
  const base = () => `/api/plugin-instances/${instance.id}`

  before(async () => {
    const description = await PluginTestHost.describe(CounterPlugin)
    const pluginTransport = new FakePluginTransport().add("counter.ts", CounterPlugin)
    app = await TestApp.start({ pluginTransport }, {}, nexus =>
      nexus.pluginCatalog.set({ pkg: { id: "counter", name: "Counter", entry: "counter.ts", description }, version: "1.0.0", source: "development" }))
    admin = await app.admin()
  })
  after(() => app.dispose())

  test("lists the available plugins with what they offer", async () => {
    const plugins = (await admin.get("/api/plugins")).json<PluginPackageDto[]>()
    assert.deepEqual(plugins.map(p => [p.id, p.version, p.description.sensors.map(s => s.id)]), [["counter", "1.0.0", ["value"]]])
  })

  test("creating an instance starts it; unknown plugins and taken slugs are refused", async () => {
    const created = await admin.post("/api/plugin-instances", { plugin: "counter", slug: "home", label: "Home" })
    assert.equal(created.statusCode, 201, created.body)
    instance = created.json<PluginInstanceDto>()
    assert.equal(instance.state, "running")
    assert.equal((await admin.post("/api/plugin-instances", { plugin: "nope", slug: "x", label: "" })).statusCode, 400)
    assert.equal((await admin.post("/api/plugin-instances", { plugin: "counter", slug: "home", label: "" })).statusCode, 409)
  })

  test("signals: added, validated by the plugin, and wired to the bus", async () => {
    const sensor = await admin.post(`${base()}/signals`, { kind: "sensor", capability: "value", params: { start: 5 }, label: "Counter value" })
    assert.equal(sensor.statusCode, 201, sensor.body)
    assert.equal(sensor.json<PluginSignalDto>().topic, "counter/home/sensor/counter-value")
    await settle()
    assert.deepEqual(app.app.bus.current("counter/home/sensor/counter-value")?.value, Value.number(5))
    const refused = await admin.post(`${base()}/signals`, { kind: "sensor", capability: "value", params: { start: "x" }, label: "bad" })
    assert.deepEqual([refused.statusCode, /invalid params/.test(refused.json<{ error: string }>().error)], [400, true])
    assert.equal((await admin.post(`${base()}/signals`, { kind: "actuator", capability: "nope", label: "x" })).statusCode, 400)
    assert.equal((await admin.post(`${base()}/signals`, { kind: "sensor", capability: "value", params: { start: 1 }, label: "Counter value" })).statusCode, 409)
    assert.deepEqual((await admin.get(`${base()}/signals`)).json<PluginSignalDto[]>().map(s => s.slug), ["counter-value"])
  })

  test("a command reaches the actuator; its effect and the store come back", async () => {
    const actuator = (await admin.post(`${base()}/signals`, { kind: "actuator", capability: "set", label: "Set" })).json<PluginSignalDto>()
    assert.equal((await admin.post("/api/bus/inject", { topic: actuator.topic, value: Value.number(7), kind: "command" })).statusCode, 204)
    await settle()
    assert.deepEqual(app.app.bus.current("counter/home/sensor/counter-value")?.value, Value.number(7))
    const row = app.app.persistence.db.get<{ value: string }>("SELECT value FROM plugin_store WHERE key = 'last'")
    assert.equal(row?.value, "7")
  })

  test("webhooks reach the running plugin without a session", async () => {
    const anonymous = app.client()
    const hook = await anonymous.post("/hook/home/value", "42", { "content-type": "text/plain" })
    assert.deepEqual([hook.statusCode, hook.body], [202, "ok"])
    await settle()
    assert.deepEqual(app.app.bus.current("counter/home/sensor/counter-value")?.value, Value.number(42))
    assert.equal((await anonymous.post("/hook/home/missing", "")).statusCode, 404)
    assert.equal((await anonymous.post("/hook/nobody/value", "")).statusCode, 404)
  })

  test("webhooks never see the session, can't set cookies, and are sandboxed", async () => {
    const echo = await admin.get("/hook/home/echo")
    assert.equal(echo.statusCode, 200)
    const seen = JSON.parse(echo.body) as Record<string, string>
    assert.equal(seen.cookie, undefined, "the admin's session cookie stays with Nexus")
    assert.equal(echo.headers["set-cookie"], undefined)
    assert.equal(echo.headers["content-security-policy"], "sandbox; default-src 'none'")
    assert.deepEqual([echo.headers["x-content-type-options"], echo.headers["x-plugin"]], ["nosniff", "yes"])
    const failed = await app.client().post("/hook/home/fail", "x")
    assert.deepEqual([failed.statusCode, /internals/.test(failed.body)], [502, false])
  })

  test("a config the plugin refuses ends in error; stop makes webhooks 503", async () => {
    const refused = (await admin.put(base(), { plugin: "counter", slug: "home", label: "Home", config: { refuse: true } })).json<PluginInstanceDto>()
    assert.deepEqual([refused.state, refused.lastError], ["error", "refused on purpose"])
    const fixed = (await admin.put(base(), { plugin: "counter", slug: "home", label: "Home", config: {} })).json<PluginInstanceDto>()
    assert.equal(fixed.state, "running")
    assert.equal((await admin.post(`${base()}/stop`)).json<PluginInstanceDto>().state, "stopped")
    assert.equal((await app.client().post("/hook/home/value", "1")).statusCode, 503)
    assert.equal((await admin.get(`${base()}/catalog`)).statusCode, 409)
  })

  test("renaming the instance moves its topics, values and forces; a signal's kind can't change", async () => {
    await admin.post(`${base()}/start`)
    await settle()
    const set = (await admin.get(`${base()}/signals`)).json<PluginSignalDto[]>().find(s => s.kind === "actuator")!
    await admin.post("/api/bus/forces", { topic: set.topic, value: Value.number(9) })
    const renamed = await admin.put(base(), { plugin: "counter", slug: "house", label: "House", config: {} })
    assert.equal(renamed.statusCode, 200, renamed.body)
    await settle()
    const topics = (await admin.get(`${base()}/signals`)).json<PluginSignalDto[]>().map(s => s.topic).sort()
    assert.deepEqual(topics, ["counter/house/actuator/set", "counter/house/sensor/counter-value"])
    assert.deepEqual(app.app.bus.activeForces().map(f => f.topic), ["counter/house/actuator/set"], "the force moved along")
    assert.deepEqual(app.app.bus.currentMatching("counter/home/#"), [])
    const kindChange = await admin.put(`${base()}/signals/${set.id}`, { kind: "sensor", capability: "value", params: { start: 1 }, label: "Set" })
    assert.equal(kindChange.statusCode, 400)
    const relabel = await admin.put(`${base()}/signals/${set.id}`, { kind: "actuator", capability: "set", label: "Setpoint" })
    assert.deepEqual([relabel.statusCode, relabel.json<PluginSignalDto>().topic], [200, "counter/house/actuator/setpoint"])
    await admin.delete(`/api/bus/forces?topic=${encodeURIComponent("counter/house/actuator/setpoint")}`)
  })

  test("deleting removes the instance, its signals and its topics", async () => {
    assert.equal((await admin.delete(base())).statusCode, 204)
    assert.deepEqual((await admin.get("/api/plugin-instances")).json(), [])
    assert.equal(app.app.signals.list().length, 0)
    assert.deepEqual(app.app.bus.currentMatching("counter/home/#"), [])
    const db = app.app.persistence.db
    assert.deepEqual([db.all("SELECT * FROM signals"), db.all("SELECT * FROM plugin_store")], [[], []])
  })
})
