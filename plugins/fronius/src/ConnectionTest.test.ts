import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { FroniusPlugin } from "./FroniusPlugin.ts"
import { FixtureServer } from "./test-support/FixtureServer.ts"

let server: FixtureServer
before(async () => (server = await FixtureServer.start()))
after(() => server.close())

test("Test connection reads the power flow once and says what it found, or why it couldn't", async () => {
  server.gen24()
  assert.match(await PluginTestHost.testConfig(FroniusPlugin, { host: server.url }) ?? "", /^Connected to http:\/\/127\.0\.0\.1:\d+: 1 inverter, PV \d+ W$/)
  server.gen24().fail("GetPowerFlowRealtimeData")
  await assert.rejects(PluginTestHost.testConfig(FroniusPlugin, { host: server.url }), /GetPowerFlowRealtimeData/)
  await assert.rejects(PluginTestHost.testConfig(FroniusPlugin, { host: "" }), /invalid config/)
})
