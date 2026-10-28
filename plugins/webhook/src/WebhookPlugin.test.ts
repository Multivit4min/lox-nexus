import assert from "node:assert/strict"
import { afterEach, describe, test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { WebhookHarness } from "./test-support/WebhookHarness.ts"
import { WebhookPlugin } from "./WebhookPlugin.ts"

const { TOKEN, call } = WebhookHarness

describe("WebhookPlugin answers", () => {
  const harness = new WebhookHarness()
  afterEach(() => harness.cleanup())

  test("the token is required, secret and at least 16 characters", async () => {
    await assert.rejects(PluginTestHost.start(WebhookPlugin, { config: {} }))
    await assert.rejects(PluginTestHost.start(WebhookPlugin, { config: { token: "too-short-token" } }))
    const description = await PluginTestHost.describe(WebhookPlugin)
    assert.match(JSON.stringify(description), /"token":\{[^}]*"writeOnly":true/)
  })

  test("204 for a call that every signal handled", async () => {
    const host = await harness.start()
    const trigger = await host.addSensor("trigger", { hook: "door" })
    const response = await call(host, { hook: "door" })
    assert.equal(response.status, 204)
    assert.deepEqual(host.values(trigger).at(-1), Value.boolean(true))
  })

  test("the three token transports work", async () => {
    const host = await harness.start()
    await host.addSensor("trigger", { hook: "door" })
    assert.equal((await call(host, { hook: "door", headers: { authorization: `Bearer ${TOKEN}` } })).status, 204)
    assert.equal((await call(host, { hook: "door", headers: { "x-webhook-token": TOKEN } })).status, 204)
    assert.equal((await call(host, { hook: "door", method: "GET", query: { token: TOKEN } })).status, 204)
  })

  test("401 with WWW-Authenticate for a missing or wrong token, and nothing fires", async () => {
    const host = await harness.start()
    const trigger = await host.addSensor("trigger", { hook: "door" })
    const attempts: Record<string, string>[] = [{ authorization: "" }, { authorization: "Bearer wrong" }, { "x-webhook-token": `${TOKEN}x` }]
    for (const headers of attempts) {
      const response = await call(host, { hook: "door", headers })
      assert.equal(response.status, 401)
      assert.equal(response.headers["www-authenticate"], "Bearer")
    }
    assert.equal((await call(host, { hook: "door", query: { token: TOKEN.slice(1) } })).status, 401)
    assert.deepEqual(host.values(trigger), [Value.boolean(false)])
  })

  test("401 before 404: without the token an unknown hook looks like a known one", async () => {
    const host = await harness.start()
    await host.addSensor("trigger", { hook: "door" })
    assert.equal((await call(host, { hook: "nothing-here", headers: { authorization: "" } })).status, 401)
    assert.equal((await call(host, { hook: "door", headers: { authorization: "" } })).status, 401)
    assert.equal((await call(host, { hook: "Not A Name!", headers: { authorization: "" } })).status, 401)
    assert.equal((await call(host, { hook: "nothing-here" })).status, 404)
    assert.equal((await call(host, { hook: "a/b" })).status, 404)
    assert.equal((await call(host, { hook: "" })).status, 404)
  })

  test("a trailing slash addresses the same hook", async () => {
    const host = await harness.start()
    await host.addSensor("trigger", { hook: "door" })
    assert.equal((await call(host, { hook: "door/" })).status, 204)
  })

  test("405 with Allow for a method no signal of the hook accepts", async () => {
    const host = await harness.start()
    const trigger = await host.addSensor("trigger", { hook: "door", method: "GET" })
    await host.addSensor("number", { hook: "door", method: "PUT", source: "query", name: "v" })
    const response = await call(host, { hook: "door", method: "POST" })
    assert.equal(response.status, 405)
    assert.equal(response.headers.allow, "GET, PUT")
    assert.deepEqual(host.values(trigger), [Value.boolean(false)])
    assert.equal((await call(host, { hook: "door", method: "get" })).status, 204, "methods compare case-insensitively")
  })

  test("method any takes every method", async () => {
    const host = await harness.start()
    await host.addSensor("trigger", { hook: "door" })
    for (const method of ["GET", "POST", "PUT", "DELETE", "PATCH"]) {
      assert.equal((await call(host, { hook: "door", method })).status, 204, method)
    }
  })

  test("400 with the reasons when values can't be read; the trigger fires anyway", async () => {
    const host = await harness.start()
    const trigger = await host.addSensor("trigger", { hook: "door" })
    const temp = await host.addSensor("number", { hook: "door", path: "temp" })
    const label = await host.addSensor("text", { hook: "door", path: "label" })
    const response = await call(host, { hook: "door", body: "{\"temp\":\"warm\"}" })
    assert.equal(response.status, 400)
    assert.deepEqual(response.body.trim().split("\n").sort(), ["JSON path \"label\" not found", "json temp: \"warm\" is not a number"])
    assert.deepEqual(host.values(trigger).at(-1), Value.boolean(true))
    assert.deepEqual(host.values(temp), [])
    assert.deepEqual(host.values(label), [])
  })

  test("several signals on one hook all handle one call", async () => {
    const host = await harness.start()
    const trigger = await host.addSensor("trigger", { hook: "meter" })
    const power = await host.addSensor("number", { hook: "meter", path: "power" })
    const state = await host.addSensor("text", { hook: "meter", path: "state" })
    const body = JSON.stringify({ power: 412.5, state: "export" })
    assert.equal((await call(host, { hook: "meter", body, headers: { "content-type": "application/json" } })).status, 204)
    assert.deepEqual(host.values(trigger).at(-1), Value.boolean(true))
    assert.deepEqual(host.values(power), [Value.number(412.5)])
    assert.deepEqual(host.values(state), [Value.string("export")])
  })

  test("the status stays running, even under wrong tokens", async () => {
    const host = await harness.start()
    for (let i = 0; i < 5; i++) await call(host, { hook: "x", headers: { authorization: "Bearer nope" } })
    assert.equal(host.status.status, "running")
  })

  test("the token never reaches the log, the sent messages or the panel", async () => {
    const host = await harness.start()
    await host.addSensor("trigger", { hook: "door" })
    await call(host, { hook: "door" })
    await call(host, { hook: "door", headers: { authorization: `Bearer ${TOKEN}-almost` } })
    await call(host, { hook: "door", query: { token: `${TOKEN}-too` } })
    const panel = await host.panel()
    assert.doesNotMatch(JSON.stringify(host.sent), new RegExp(TOKEN))
    assert.doesNotMatch(JSON.stringify(panel), new RegExp(TOKEN))
  })
})
