import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import type { CatalogNode } from "@lox-nexus/plugin-sdk"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { HomeAssistantPlugin } from "../HomeAssistantPlugin.ts"
import { FakeHomeAssistant } from "../test-support/FakeHomeAssistant.ts"
import { waitFor } from "../test-support/waitFor.ts"

/** the node at a label path, e.g. ["Kitchen", "light"] */
const at = (nodes: CatalogNode[] | undefined, ...labels: string[]): CatalogNode | undefined => {
  const [first, ...rest] = labels
  const node = nodes?.find(candidate => candidate.label === first)
  return rest.length === 0 ? node : at(node?.children, ...rest)
}

describe("HomeAssistantPlugin: catalog", { timeout: 15_000 }, () => {
  let ha: FakeHomeAssistant
  let host: PluginTestHost

  before(async () => {
    ha = await FakeHomeAssistant.start()
    ha.set("light.ceiling", "on", { friendly_name: "Ceiling", brightness: 200, supported_color_modes: ["color_temp", "xy"], icon: "mdi:lamp" })
    ha.set("cover.blind", "open", { friendly_name: "Blind", current_position: 100, supported_features: 15 })
    ha.set("switch.pump", "off", { friendly_name: "Pump" })
    ha.set("sensor.power", "1520.5", { friendly_name: "Power", unit_of_measurement: "W" })
    ha.set("sensor.hidden", "1")
    ha.set("climate.range", "heat_cool", { friendly_name: "Range", supported_features: 2 })
    ha.set("climate.full", "heat", { friendly_name: "Full", supported_features: 1 | 128 | 256 })
    ha.registries = {
      areas: [{ area_id: "kitchen", name: "Kitchen" }, { area_id: "living", name: "Living room" }],
      devices: [{ id: "d1", area_id: "living" }],
      entities: [
        { entity_id: "light.ceiling", area_id: "kitchen", device_id: "d1" },
        { entity_id: "cover.blind", area_id: null, device_id: "d1" },
        { entity_id: "sensor.hidden", hidden_by: "user" }
      ]
    }
    host = await PluginTestHost.start(HomeAssistantPlugin, { config: { url: ha.url, token: FakeHomeAssistant.TOKEN } })
    await waitFor(() => ha.clients === 1)
  })
  after(async () => {
    await host.stop()
    await ha.close()
  })

  test("groups entities by area (their own or their device's) and domain, without hidden ones", async () => {
    const catalog = await host.catalog()
    assert.deepEqual(catalog.map(node => node.label), ["Kitchen", "Living room", "No area"])
    assert.ok(at(catalog, "Living room", "cover", "Blind (cover.blind)"), "the device's area")
    assert.ok(at(catalog, "No area", "switch", "Pump (switch.pump)"))
    assert.equal(JSON.stringify(catalog).includes("sensor.hidden"), false)
  })

  test("offers each entity its state, measuring attributes, light values and fitting actuators", async () => {
    const catalog = await host.catalog()
    const light = at(catalog, "Kitchen", "light", "Ceiling (light.ceiling)")?.entries?.map(entry => [entry.kind, entry.capability, entry.label])
    assert.deepEqual(light, [
      ["sensor", "state", "Ceiling state"],
      ["sensor", "state", "Ceiling brightness"],
      ["sensor", "light", "Ceiling light brightness"],
      ["sensor", "light", "Ceiling light colour"],
      ["actuator", "onOff", "Ceiling on/off"],
      ["actuator", "lightBrightness", "Ceiling light brightness"],
      ["actuator", "lightColor", "Ceiling light colour"],
      ["actuator", "lightTemperature", "Ceiling light colour temperature"]
    ])
    const values = at(catalog, "Kitchen", "light", "Ceiling (light.ceiling)")?.entries?.map(entry => [entry.capability, entry.value, entry.unit])
    assert.deepEqual(values?.slice(0, 3), [
      ["state", Value.boolean(true), undefined], ["state", Value.number(200), undefined], ["light", Value.singleChannel({ channel: 78, fadeTime: 0 }), undefined]
    ], "current values, as the sensors would send them")
    const blind = at(catalog, "Living room", "cover", "Blind (cover.blind)")?.entries?.map(entry => [entry.capability, entry.label, entry.params])
    assert.deepEqual(blind, [
      ["state", "Blind state", { entityId: "cover.blind" }],
      ["state", "Blind current_position", { entityId: "cover.blind", attribute: "current_position" }],
      ["onOff", "Blind open/close", { entityId: "cover.blind" }],
      ["position", "Blind position", { entityId: "cover.blind" }]
    ], "no tilt: supported_features 15 lacks SET_TILT_POSITION")
  })

  test("offers only the services an entity's supported_features allow", async () => {
    const catalog = await host.catalog()
    const actuators = (label: string) => at(catalog, "No area", "climate", label)?.entries?.filter(entry => entry.kind === "actuator").map(entry => entry.capability)
    assert.deepEqual(actuators("Range (climate.range)"), ["text"], "no on/off without TURN_ON/TURN_OFF, no temperature without TARGET_TEMPERATURE")
    assert.deepEqual(actuators("Full (climate.full)"), ["onOff", "temperature", "text"])
  })

  test("a sensor's state shows with Home Assistant's unit; a cover's position as %", async () => {
    const catalog = await host.catalog()
    const power = at(catalog, "No area", "sensor", "Power (sensor.power)")?.entries?.[0]
    assert.deepEqual([power?.value, power?.unit], [Value.number(1520.5), "W"])
    const position = at(catalog, "Living room", "cover", "Blind (cover.blind)")?.entries?.find(entry => entry.capability === "position")
    assert.deepEqual([position?.value, position?.unit], [Value.number(100), "%"])
  })
})
