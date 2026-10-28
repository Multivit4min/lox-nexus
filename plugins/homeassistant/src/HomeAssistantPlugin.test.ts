import assert from "node:assert/strict"
import { afterEach, describe, test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { HomeAssistantPlugin } from "./HomeAssistantPlugin.ts"
import { FakeHomeAssistant } from "./test-support/FakeHomeAssistant.ts"
import { waitFor } from "./test-support/waitFor.ts"

/** what the plugin reported as a signal's failure, if anything */
const failureOf = (host: PluginTestHost, signalId: string) =>
  host.sent.findLast(message => message.type === "signal.error" && message.signalId === signalId)

describe("HomeAssistantPlugin: connection and sensors", { timeout: 15_000 }, () => {
  const cleanup: Array<() => Promise<void>> = []
  afterEach(async () => {
    for (const step of cleanup.splice(0).reverse()) await step()
  })

  const setup = async (token = FakeHomeAssistant.TOKEN) => {
    const ha = await FakeHomeAssistant.start()
    cleanup.push(() => ha.close())
    ha.set("sensor.outdoor", "12.5", { unit_of_measurement: "°C", friendly_name: "Outdoor" })
    ha.set("binary_sensor.door", "off")
    ha.set("climate.living", "heat", { current_temperature: 20.5, hvac_modes: ["heat", "off"] })
    const host = await PluginTestHost.start(HomeAssistantPlugin, { config: { url: ha.url, token } })
    cleanup.push(() => host.stop())
    return { ha, host }
  }

  test("state sensors read numbers, on/off and attributes, and follow changes", async () => {
    const { ha, host } = await setup()
    const outdoor = await host.addSensor("state", { entityId: "sensor.outdoor" })
    const door = await host.addSensor("state", { entityId: "binary_sensor.door" })
    const current = await host.addSensor("state", { entityId: "climate.living", attribute: "current_temperature" })
    const mode = await host.addSensor("state", { entityId: "climate.living" })
    assert.deepEqual([outdoor, door, current, mode].map(id => host.values(id)), [
      [Value.number(12.5)], [Value.boolean(false)], [Value.number(20.5)], [Value.string("heat")]
    ])
    const next = host.next(door)
    ha.set("binary_sensor.door", "on")
    assert.deepEqual(await next, Value.boolean(true))
  })

  test("unavailable keeps the last value; a removed entity fails the signal until it is back", async () => {
    const { ha, host } = await setup()
    const outdoor = await host.addSensor("state", { entityId: "sensor.outdoor" })
    const door = await host.addSensor("state", { entityId: "binary_sensor.door" })
    const missing = await host.addSensor("state", { entityId: "sensor.nope" })
    const failure = failureOf(host, missing)
    assert.ok(failure?.type === "signal.error" && /has no entity sensor\.nope/.test(failure.error))
    ha.set("sensor.outdoor", "unavailable")
    // events arrive in order, so once the door changed, the unavailable state was handled too
    const opened = host.next(door)
    ha.set("binary_sensor.door", "on")
    await opened
    assert.deepEqual(host.values(outdoor), [Value.number(12.5)])
    ha.remove("sensor.outdoor")
    await waitFor(() => failureOf(host, outdoor) !== undefined)
    // back, but without a value yet: the failure clears all the same
    ha.set("sensor.outdoor", "unavailable")
    await waitFor(() => host.sent.some(message => message.type === "signal.recovered" && message.signalId === outdoor))
    const back = host.next(outdoor)
    ha.set("sensor.outdoor", "13")
    assert.deepEqual(await back, Value.number(13))
  })

  test("light sensors send brightness and colour the Loxone way", async () => {
    const { ha, host } = await setup()
    ha.set("light.desk", "on", { brightness: 128, color_mode: "color_temp", color_temp_kelvin: 3000, supported_color_modes: ["color_temp", "xy"] })
    const brightness = await host.addSensor("light", { entityId: "light.desk" })
    const color = await host.addSensor("light", { entityId: "light.desk", part: "color" })
    // the entity may reach the plugin after the sensors were added
    await waitFor(() => host.values(color).length === 1)
    assert.deepEqual(host.values(brightness), [Value.singleChannel({ channel: 50, fadeTime: 0 })])
    assert.deepEqual(host.values(color), [Value.tunableWhite({ temperature: 3000, brightness: 50, fadeTime: 0 })])
    let next = host.next(color)
    ha.set("light.desk", "off", { supported_color_modes: ["color_temp", "xy"] })
    assert.deepEqual(await next, Value.tunableWhite({ temperature: 3000, brightness: 0, fadeTime: 0 }), "off keeps the shape")
    next = host.next(color)
    ha.set("light.desk", "on", { brightness: 255, color_mode: "xy", rgb_color: [255, 0, 51], supported_color_modes: ["color_temp", "xy"] })
    assert.deepEqual(await next, Value.rgbw({ red: 100, green: 0, blue: 20, white: 0, fadeTime: 0, flags: 0 }))
    await assert.rejects(host.addSensor("light", { entityId: "switch.desk" }), /a light entity/)
  })

  test("a rejected token fails the start and is tried only once", async () => {
    const ha = await FakeHomeAssistant.start()
    cleanup.push(() => ha.close())
    await assert.rejects(PluginTestHost.start(HomeAssistantPlugin, { config: { url: ha.url, token: "wrong" } }), /rejected the token/)
    assert.equal(ha.authAttempts, 1)
  })

  test("an unreachable Home Assistant starts degraded", async () => {
    const ha = await FakeHomeAssistant.start()
    const url = ha.url
    await ha.close()
    const host = await PluginTestHost.start(HomeAssistantPlugin, { config: { url, token: "t" } })
    cleanup.push(() => host.stop())
    assert.equal(host.status.status, "degraded")
    assert.match(host.status.message ?? "", /disconnected: .*reconnecting/)
  })

  test("a dropped connection reconnects, catches up on changes and shows in the panel", async () => {
    const { ha, host } = await setup()
    const outdoor = await host.addSensor("state", { entityId: "sensor.outdoor" })
    ha.dropConnections()
    await waitFor(() => host.status.status === "degraded", "degraded after the drop")
    ha.entities.set("sensor.outdoor", { s: "14", a: {} })
    await waitFor(() => host.status.status === "running", "reconnected", 5000)
    await waitFor(() => host.values(outdoor).length === 2)
    assert.deepEqual(host.values(outdoor)[1], Value.number(14), "the new subscription's full load brings the change")
    const panel = await host.panel()
    const items = panel?.type === "keyValue" ? Object.fromEntries(panel.items.map(item => [item.label, item.value])) : {}
    assert.match(items.Connection ?? "", /^connected since /)
    assert.deepEqual([items["Home Assistant version"], items.Entities, items["Reconnect attempts"]], ["2026.10.2", "3", "1"])
  })

  test("stopping closes the connection", async () => {
    const { ha, host } = await setup()
    assert.equal(ha.clients, 1)
    await host.stop()
    await waitFor(() => ha.clients === 0, "the socket closed")
  })
})
