import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import type { Panel } from "@lox-nexus/plugin-sdk"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { ScriptPlugin } from "./ScriptPlugin.ts"
import { ScriptHarness } from "./test-support/ScriptHarness.ts"

let host: PluginTestHost | undefined
afterEach(() => host?.stop())

test("the script's Date works in the zone the host sends, and the panel says which", async () => {
  host = await PluginTestHost.start(ScriptPlugin, {
    timeZone: "Europe/Vienna",
    config: { script: "console.info(String(new Date(\"2026-10-29T09:00:00Z\")))" }
  })
  assert.ok(ScriptHarness.logs(host).some(line => line.includes("Thu Oct 29 2026 10:00:00 GMT+0100")), ScriptHarness.logs(host).join("\n"))
  const panel = await host.panel() as Extract<Panel, { type: "sections" }>
  const items = panel.sections[0]?.panel.type === "keyValue" ? panel.sections[0].panel.items : []
  assert.deepEqual(items.find(item => item.label === "Time zone")?.value, "Europe/Vienna")
})

test("without one from the host it is the server's zone", async () => {
  host = await PluginTestHost.start(ScriptPlugin, { config: { script: "console.info(String(new Date(0).getTimezoneOffset()))" } })
  assert.ok(ScriptHarness.logs(host).includes(String(new Date(0).getTimezoneOffset())), ScriptHarness.logs(host).join("\n"))
})
