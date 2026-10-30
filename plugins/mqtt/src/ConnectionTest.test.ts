import assert from "node:assert/strict"
import { test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { MqttPlugin } from "./MqttPlugin.ts"
import { TestBroker } from "./test-support/TestBroker.ts"

test("Test connection connects and disconnects; refused credentials say so", async t => {
  const broker = await TestBroker.start({ credentials: { username: "nexus", password: "secret" } })
  t.after(() => broker.close())
  assert.match(await PluginTestHost.testConfig(MqttPlugin, { url: broker.url, username: "nexus", password: "secret" }) ?? "", /^Connected to /)
  await assert.rejects(PluginTestHost.testConfig(MqttPlugin, { url: broker.url, username: "nexus", password: "wrong" }), /user name or password|not authorized|refused/i)
})
