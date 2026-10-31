import assert from "node:assert/strict"
import { after, afterEach, before, describe, mock, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { cellText, PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { FroniusPlugin } from "./FroniusPlugin.ts"
import { FixtureServer } from "./test-support/FixtureServer.ts"
import { newResources, waitFor } from "./test-support/waitFor.ts"

/** the plugin instance inside the host, to wait for its poller */
const pluginOf = (host: PluginTestHost) => host.plugin as FroniusPlugin

/** the panel's tiles and status items as label → shown value */
const panelItems = async (host: PluginTestHost) => {
  const panel = await host.panel()
  assert.ok(panel?.type === "sections")
  const [tiles, status] = panel.sections.map(section => section.panel)
  assert.ok(tiles?.type === "tiles" && status?.type === "keyValue")
  const tile = (value: number | string | null, unit?: string, decimals?: number) =>
    value === null ? "–" : typeof value === "number" ? `${value.toFixed(decimals ?? 0)} ${unit}` : value
  return Object.fromEntries([
    ...tiles.tiles.map(entry => [entry.label, tile(entry.value, entry.unit, entry.decimals)]),
    ...status.items.map(item => [item.label, cellText(item.value)])
  ])
}

describe("FroniusPlugin", () => {
  let server: FixtureServer
  before(async () => (server = await FixtureServer.start()))
  after(() => server.close())
  // stopping twice is harmless, and a failed assertion must not leave a polling plugin behind
  const hosts: PluginTestHost[] = []
  afterEach(async () => {
    mock.timers.reset()
    await Promise.all(hosts.splice(0).map(host => host.stop()))
  })

  const start = async (config: Record<string, unknown> = {}) => {
    const host = await PluginTestHost.start(FroniusPlugin, { config: { host: server.url, ...config } })
    hosts.push(host)
    return host
  }

  /** a started plugin whose first poll has finished */
  const started = async (config: Record<string, unknown> = {}) => {
    const host = await start(config)
    await pluginOf(host).poller.idle()
    return host
  }

  test("value sensors emit what their paths point to, now and after every poll", async () => {
    server.gen24()
    mock.timers.enable({ apis: ["setInterval"] })
    const host = await started({ pollInterval: 10 })
    const pv = await host.addSensor("value", { path: "powerflow.Site.P_PV" })
    const soc = await host.addSensor("value", { path: "storage.0.Controller.StateOfCharge_Relative" })
    const mode = await host.addSensor("value", { path: "powerflow.Inverters.1.Battery_Mode" })
    const day = await host.addSensor("value", { path: "powerflow.Site.E_Day" })
    const phase = await host.addSensor("value", { path: "meter.0.Voltage_AC_Phase_1" })
    assert.deepEqual([pv, soc, mode, day, phase].map(id => host.values(id)), [
      [Value.number(3080.4)], [Value.number(63.2)], [Value.string("normal")], [Value.null()], [Value.number(231.2)]
    ])
    mock.timers.tick(10_000)
    await waitFor(() => host.values(pv).length === 2)
    assert.deepEqual(host.values(pv)[1], Value.number(3080.4), "the bus dedups repeats, the sensor sends every poll")
    await host.stop()
  })

  test("a path that doesn't resolve emits nothing; an invalid path is refused", async () => {
    server.produceOnly()
    const host = await started()
    const battery = await host.addSensor("value", { path: "storage.0.Controller.StateOfCharge_Relative" })
    const object = await host.addSensor("value", { path: "powerflow.Site" })
    const inherited = await host.addSensor("value", { path: "powerflow.Site.constructor" })
    await pluginOf(host).poller.poll()
    assert.deepEqual([host.values(battery), host.values(object), host.values(inherited)], [[], [], []])
    await assert.rejects(host.addSensor("value", { path: "Site.P_PV" }), /invalid params/)
    await assert.rejects(host.addSensor("value", { path: "powerflow" }), /invalid params/)
    await host.stop()
  })

  test("starts with the inverter down, degraded with the reason, and recovers on a later poll", async () => {
    server.gen24().fail("GetPowerFlowRealtimeData")
    mock.timers.enable({ apis: ["setInterval"] })
    const host = await started()
    assert.deepEqual(host.status, { status: "degraded", message: "GetPowerFlowRealtimeData: HTTP 500" })
    mock.timers.tick(5_000)
    await pluginOf(host).poller.idle()
    assert.equal(host.sent.filter(message => message.type === "status").length, 1, "a lasting problem is reported once")
    server.gen24()
    mock.timers.tick(5_000)
    await pluginOf(host).poller.idle()
    assert.deepEqual(host.status, { status: "running", message: undefined })
    const logs = host.sent.flatMap(message => (message.type === "log" && message.level !== "debug" ? [message.message] : []))
    assert.deepEqual(logs, ["can't read the inverter", "reading the inverter again"])
    await host.stop()
  })

  test("an unreachable or hanging inverter doesn't hold up the start", async () => {
    const release = server.hold()
    const host = await start({ timeout: 1 })
    assert.equal(host.status.status, "running", "nothing known yet")
    await host.stop()
    release()
  })

  test("the catalog lists what this installation reports", async () => {
    server.gen24()
    const host = await started()
    const catalog = await host.catalog()
    assert.deepEqual(catalog.map(node => node.label), ["Site", "Inverters", "Meters", "Batteries"])
    const site = catalog[0]?.entries ?? []
    assert.deepEqual(site.map(entry => (entry.params as { path: string }).path.replace("powerflow.Site.", "")), [
      "P_PV", "P_Grid", "P_Load", "P_Akku", "rel_Autonomy", "rel_SelfConsumption", "E_Total", "Mode", "BackupMode", "BatteryStandby"
    ])
    assert.deepEqual(site[0], {
      kind: "sensor", capability: "value", params: { path: "powerflow.Site.P_PV" }, label: "PV power", value: Value.number(3080.4), unit: "W"
    }, "with the current value and its unit")
    const storage = catalog[3]?.children?.[0]
    assert.equal(storage?.label, "Battery 0 (BYD Battery-Box Premium HV)")
    assert.deepEqual(storage?.entries?.[0], {
      kind: "sensor", capability: "value", params: { path: "storage.0.Controller.StateOfCharge_Relative" }, label: "Battery 0 state of charge",
      value: Value.number(63.2), unit: "%"
    })
    const modeEntry = site.find(entry => entry.label === "System mode")
    assert.deepEqual([modeEntry?.value?.type, modeEntry?.unit], ["string", undefined], "no unit for texts")
    const meter = catalog[2]?.children?.[0]
    assert.equal(meter?.entries?.length, 22)
    assert.deepEqual(catalog[1]?.children?.[0]?.entries?.map(entry => entry.label), [
      "Inverter 1 AC power", "Inverter 1 battery state of charge", "Inverter 1 battery mode", "Inverter 1 energy produced in total"
    ])
    await host.stop()
  })

  test("without meter and battery the catalog has neither", async () => {
    server.produceOnly()
    const host = await started()
    const catalog = await host.catalog()
    assert.deepEqual(catalog.map(node => node.label), ["Site", "Inverters"])
    assert.deepEqual(catalog[0]?.entries?.map(entry => entry.label), ["PV power", "Energy produced today", "Energy produced this year", "Energy produced in total", "System mode"])
    await host.stop()
  })

  test("the panel shows the power flow and how polling goes", async () => {
    server.gen24()
    const host = await started()
    const { "Last successful poll": polled, ...power } = await panelItems(host)
    assert.deepEqual(power, {
      Photovoltaics: "3080 W", Grid: "-1181 W", Load: "-1358 W", Battery: "-412 W", "Battery charge": "63.2 %", Autonomy: "100.0 %", Reading: "ok"
    })
    assert.ok(!Number.isNaN(Date.parse(polled ?? "")), "an ISO timestamp")
    // counted where the plugin calls it, before the SDK's one-a-second throttle
    let pushes = 0
    pluginOf(host).panelChanged = () => void pushes++
    await pluginOf(host).poller.poll()
    assert.equal(pushes, 1, "after every poll")
    server.fail("GetPowerFlowRealtimeData")
    await pluginOf(host).poller.poll()
    assert.equal(pushes, 2, "the page is told the reading failed")
    const failing = await panelItems(host)
    assert.match(failing["Last error"] ?? "", /^GetPowerFlowRealtimeData: HTTP 500 \(\d{4}-/)
    assert.match(failing.Reading ?? "", /^can't read the inverter/)
    await host.stop()
  })

  test("before the first poll the catalog is empty and the panel says so", async () => {
    const release = server.hold()
    const host = await start()
    assert.deepEqual(await host.catalog(), [])
    assert.deepEqual(Object.values(await panelItems(host)), ["–", "–", "–", "waiting for the first poll", "never"])
    release()
    await host.stop()
  })

  test("the config needs an http(s) URL and has defaults", async () => {
    await assert.rejects(PluginTestHost.start(FroniusPlugin, { config: { host: "ftp://inverter" } }), /invalid config/)
    await assert.rejects(PluginTestHost.start(FroniusPlugin, { config: { host: server.url, timeout: 90 } }), /invalid config/)
    const description = await PluginTestHost.describe(FroniusPlugin)
    const fields = description.config.properties as Record<string, { title?: string; description?: string }>
    assert.deepEqual(Object.values(fields).map(field => field.title), ["Address", "Poll every (seconds)", "Timeout (seconds)"])
    assert.ok(Object.values(fields).every(field => field.description), "descriptions survive .meta()")
    const path = (description.sensors[0]?.params as { properties: Record<string, { title?: string; description?: string }> }).properties.path
    assert.equal(path?.title, "Data path")
    assert.match(path?.description ?? "", /catalog/)
    assert.deepEqual(description.sensors.map(sensor => [sensor.id, sensor.valueType]), [["value", "any"]])
  })

  test("stopping leaves no timers, sockets or requests behind, also mid-poll", async () => {
    server.gen24()
    const baseline = process.getActiveResourcesInfo()
    for (let cycle = 0; cycle < 2; cycle++) {
      const host = await started({ pollInterval: 1 })
      await host.addSensor("value", { path: "powerflow.Site.P_PV" })
      await host.stop()
    }
    const release = server.hold()
    const hanging = await start()
    await hanging.stop()
    release()
    await waitFor(() => newResources(baseline).length === 0, `left behind: ${newResources(baseline).join(", ")}`)
  })
})
