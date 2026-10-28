import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { HomeAssistantPlugin } from "./HomeAssistantPlugin.ts"

/** the JSON Schema of one property */
type Field = { title?: string, description?: string, writeOnly?: boolean, enumLabels?: Record<string, string> }
const fields = (schema: unknown) => (schema as { properties: Record<string, Field> }).properties

describe("HomeAssistantPlugin: form labels", () => {
  test("config fields have titles and hints; the token stays write-only", async () => {
    const { config } = await PluginTestHost.describe(HomeAssistantPlugin)
    const { url, token } = fields(config)
    assert.equal(url?.title, "URL")
    assert.match(url?.description ?? "", /homeassistant\.local:8123/)
    assert.deepEqual([token?.title, token?.writeOnly], ["Access token", true])
    assert.match(token?.description ?? "", /Long-lived access token/)
  })

  test("each entity field gives an example of its own kind", async () => {
    const description = await PluginTestHost.describe(HomeAssistantPlugin)
    const examples = Object.fromEntries([...description.sensors, ...description.actuators].map(capability => {
      const entityId = fields(capability.params).entityId
      return [capability.id, [entityId?.title, entityId?.description?.replace(/^.*e\.g\. /, "")]]
    }))
    assert.deepEqual(examples.position, ["Entity ID", "cover.living_room"])
    assert.deepEqual(examples.temperature, ["Entity ID", "climate.living_room"])
    assert.deepEqual(examples.light, ["Entity ID", "light.kitchen"])
    assert.deepEqual(examples.service, ["Target entity", "media_player.living_room. Leave empty if the service takes none"])
  })

  test("the light sensor names its choices", async () => {
    const { sensors } = await PluginTestHost.describe(HomeAssistantPlugin)
    const part = fields(sensors.find(sensor => sensor.id === "light")?.params).part
    assert.equal(part?.title, "What to send")
    assert.deepEqual(Object.keys(part?.enumLabels ?? {}), ["brightness", "color"])
  })

  test("the service call's fields have titles", async () => {
    const { actuators } = await PluginTestHost.describe(HomeAssistantPlugin)
    const params = fields(actuators.find(actuator => actuator.id === "service")?.params)
    assert.deepEqual(Object.fromEntries(Object.entries(params).map(([key, field]) => [key, field.title])), {
      domain: "Service domain", service: "Service", entityId: "Target entity", field: "Value goes into field", data: "Extra service data"
    })
  })
})
