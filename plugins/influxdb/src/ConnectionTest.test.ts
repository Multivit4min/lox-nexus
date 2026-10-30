import assert from "node:assert/strict"
import { test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { InfluxPlugin } from "./InfluxPlugin.ts"
import { FakeInflux } from "./test-support/FakeInflux.ts"

test("Test connection asks the health endpoint and writes nothing", async t => {
  const influx = await FakeInflux.start()
  t.after(() => influx.close())
  const config = { url: influx.url, org: "home", bucket: "loxone", token: "t" }
  assert.match(await PluginTestHost.testConfig(InfluxPlugin, config) ?? "", /^Reached .* bucket loxone\. The token is checked by the first write\.$/)
  assert.equal(influx.checks.length, 1)
  assert.equal(influx.requests.length, 0, "no write")
  influx.health = { status: 503, body: "starting" }
  await assert.rejects(PluginTestHost.testConfig(InfluxPlugin, config), /answered 503: starting/)
})
