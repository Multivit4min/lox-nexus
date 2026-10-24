import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { FroniusPlugin } from "./FroniusPlugin.ts"
import { FixtureServer } from "./test-support/FixtureServer.ts"

let server: FixtureServer
before(async () => (server = (await FixtureServer.start()).liveGen24()))
after(() => server.close())

test("a recorded GEN24 without battery: values, catalog and panel", async () => {
  const host = await PluginTestHost.start(FroniusPlugin, { config: { host: server.url } })
  await (host as unknown as { runtime: { plugin: FroniusPlugin } }).runtime.plugin.poller.idle()
  const solax = await host.addSensor("value", { path: "meter.3.PowerReal_P_Sum" })
  const battery = await host.addSensor("value", { path: "powerflow.Site.P_Akku" })
  assert.deepEqual(host.values(solax), [Value.number(295.4)])
  assert.deepEqual(host.values(battery), [Value.null()], "P_Akku is null without a battery")

  const catalog = await host.catalog()
  assert.deepEqual(catalog.map(node => node.label), ["Site", "Inverters", "Meters"], "no battery, no Storages node")
  const meters = catalog[2]?.children ?? []
  assert.deepEqual(meters.map(meter => meter.label), ["Meter 2 (Smart Meter TS 65A-3)", "Meter 3 (Solax)"])
  assert.equal(meters[1]?.entries?.[0]?.label, "Solax power", "a secondary meter is named by its label")
  const site = (catalog[0]?.entries ?? []).map(entry => entry.label)
  assert.ok(!site.some(label => label.startsWith("Battery")), site.join(", "))

  assert.equal(host.status.status, "running")
  await host.stop()
})
