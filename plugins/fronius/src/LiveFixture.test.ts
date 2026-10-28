import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { FroniusPlugin } from "./FroniusPlugin.ts"
import { FixtureServer } from "./test-support/FixtureServer.ts"

let server: FixtureServer
before(async () => (server = await FixtureServer.start()))
after(() => server.close())

/** a started plugin whose first poll has finished */
const started = async () => {
  const host = await PluginTestHost.start(FroniusPlugin, { config: { host: server.url } })
  await host.plugin.poller.idle()
  return host
}

test("a recorded GEN24 without battery: values, catalog and panel", async () => {
  server.liveGen24()
  const host = await started()
  const solax = await host.addSensor("value", { path: "meter.3.PowerReal_P_Sum" })
  const battery = await host.addSensor("value", { path: "powerflow.Site.P_Akku" })
  assert.deepEqual(host.values(solax), [Value.number(295.4)])
  assert.deepEqual(host.values(battery), [Value.null()], "P_Akku is null without a battery")

  const catalog = await host.catalog()
  assert.deepEqual(catalog.map(node => node.label), ["Site", "Inverters", "Meters"], "no battery, no Batteries node")
  const meters = catalog[2]?.children ?? []
  assert.deepEqual(meters.map(meter => meter.label), ["Meter 2 (Smart Meter TS 65A-3)", "Meter 3 (Solax)"])
  assert.equal(meters[1]?.entries?.[0]?.label, "Solax power", "a secondary meter is named by its label")
  const site = (catalog[0]?.entries ?? []).map(entry => entry.label)
  assert.ok(!site.some(label => label.startsWith("Battery")), site.join(", "))

  assert.equal(host.status.status, "running")
  await host.stop()
})

test("a recorded GEN24 with battery and Ohm Pilot: values, catalog and panel", async () => {
  server.liveGen24Battery()
  const host = await started()
  const soc = await host.addSensor("value", { path: "storage.0.Controller.StateOfCharge_Relative" })
  const mode = await host.addSensor("value", { path: "powerflow.Inverters.1.Battery_Mode" })
  const water = await host.addSensor("value", { path: "powerflow.Smartloads.Ohmpilots.0.Temperature" })
  assert.deepEqual([host.values(soc), host.values(mode), host.values(water)], [[Value.number(5.7)], [Value.string("nearly depleted")], [Value.number(52.9)]])

  const catalog = await host.catalog()
  assert.deepEqual(catalog.map(node => node.label), ["Site", "Inverters", "Meters", "Batteries", "Ohm Pilots"])
  assert.deepEqual(catalog.slice(2).map(node => node.children?.[0]?.label), ["Meter 0 (Smart Meter 63A)", "Battery 0 (BYD Battery-Box Premium HV)", "Ohm Pilot 0"])
  const site = (catalog[0]?.entries ?? []).map(entry => entry.label)
  assert.ok(site.includes("Battery power (+ discharge, - charge)") && site.includes("Battery standby"), site.join(", "))

  const panel = await host.panel()
  const items = panel?.type === "keyValue" ? Object.fromEntries(panel.items.map(item => [item.label, item.value])) : {}
  assert.deepEqual([items["Battery charge"], items.Battery], ["5.7 %", "0 W"])
  await host.stop()
})
