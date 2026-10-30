import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { HomeAssistantPlugin } from "./HomeAssistantPlugin.ts"
import { FakeHomeAssistant } from "./test-support/FakeHomeAssistant.ts"

let ha: FakeHomeAssistant
before(async () => (ha = await FakeHomeAssistant.start()))
after(() => ha.close())

// a wrong token only against the fake: never against a real Home Assistant
test("Test connection logs in and names the version; a refused token says so", async () => {
  assert.equal(await PluginTestHost.testConfig(HomeAssistantPlugin, { url: ha.url, token: FakeHomeAssistant.TOKEN }), "Connected to Home Assistant 2026.10.2")
  await assert.rejects(PluginTestHost.testConfig(HomeAssistantPlugin, { url: ha.url, token: "wrong" }), /Invalid access token/)
})
