import assert from "node:assert/strict"
import { afterEach, describe, mock, test } from "node:test"
import type { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { WebhookHarness } from "./test-support/WebhookHarness.ts"
import { WebhookPanel } from "./WebhookPanel.ts"

const { call } = WebhookHarness

/** the panel's sections by title */
async function sections(host: PluginTestHost) {
  const panel = await host.panel()
  assert.equal(panel?.type, "sections")
  return Object.fromEntries(panel?.type === "sections" ? panel.sections.map(section => [section.title, section.panel]) : [])
}

/** the hooks table as rows of column → cell */
async function rows(host: PluginTestHost) {
  const table = (await sections(host)).Hooks
  assert.equal(table?.type, "table")
  if (table?.type !== "table") return []
  assert.deepEqual(table.columns, WebhookPanel.columns)
  return table.rows.map(row => Object.fromEntries(table.columns.map((column, i) => [column, row[i]])))
}

describe("WebhookPanel", () => {
  const harness = new WebhookHarness()
  afterEach(async () => {
    await harness.cleanup()
    mock.timers.reset()
  })

  test("lists every hook with its signals and counters, then the refused calls", async () => {
    mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-28T10:00:00Z") })
    const host = await harness.start()
    await host.addSensor("trigger", { hook: "door", pulseMs: 500 })
    await host.addSensor("number", { hook: "door", source: "query", name: "v" }, "Door level")
    await host.addSensor("text", { hook: "alarm", method: "PUT", source: "body" })
    await call(host, { hook: "door", query: { v: "1" } })
    mock.timers.tick(60_000)
    await call(host, { hook: "door" })
    await call(host, { hook: "door", method: "PUT" })
    await call(host, { hook: "door", headers: { authorization: "Bearer wrong" } })
    await call(host, { hook: "nope", headers: { authorization: "" } })
    await call(host, { hook: "nope" })
    const [alarm, door, ...more] = await rows(host)
    assert.deepEqual(more, [], "one row per hook")
    assert.deepEqual(alarm, {
      Hook: "alarm", URL: "/hook/test/alarm", Methods: "PUT", Signals: "text from body", Calls: "0", "Last call": "never", "Last result": ""
    })
    assert.deepEqual(door, {
      Hook: "door",
      URL: "/hook/test/door",
      Methods: "POST, any",
      Signals: "\"Door level\": number from query v; trigger, 500 ms pulse",
      // the call without the token counts only among the refused calls
      Calls: "3",
      "Last call": "2026-10-28T10:01:00.000Z",
      "Last result": "ok"
    })
    assert.deepEqual((await sections(host))["Refused calls"], {
      type: "keyValue",
      items: [
        { label: "Wrong or missing token (401)", value: "2, last 2026-10-28T10:01:00.000Z · wrong 1, missing 1" },
        { label: "Unknown hook (404, under /hook/test/…)", value: "1, last 2026-10-28T10:01:00.000Z" }
      ]
    })
  })

  test("the last result says what went wrong", async () => {
    const host = await harness.start()
    await host.addSensor("number", { hook: "door", path: "t" })
    const lastResult = async () => (await rows(host))[0]?.["Last result"]
    await call(host, { hook: "door", body: "{\"t\":1}" })
    assert.equal(await lastResult(), "ok")
    await call(host, { hook: "door", body: "nope" })
    assert.equal(await lastResult(), "bad request: the body is not valid JSON")
    await call(host, { hook: "door", method: "GET" })
    assert.equal(await lastResult(), "method GET not allowed")
  })

  test("counters live in memory, not in the store (old bug 5)", async () => {
    const host = await harness.start()
    await host.addSensor("trigger", { hook: "door" })
    for (let i = 0; i < 10; i++) await call(host, { hook: "door" })
    assert.deepEqual(host.store, {})
    assert.equal(host.sent.filter(message => message.type.startsWith("store")).length, 0)
    assert.equal((await rows(host))[0]?.Calls, "10")
  })
})
