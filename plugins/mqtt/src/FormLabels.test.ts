import assert from "node:assert/strict"
import { test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { MqttPlugin } from "./MqttPlugin.ts"

type Field = { title?: string; description?: string; writeOnly?: boolean; signalName?: boolean; enumLabels?: Record<string, string>; enum?: string[] }
type Schema = { properties?: Record<string, Field> }

/** every field has a title and a description, every choice a label */
function checkFields(schema: unknown, where: string) {
  const fields = (schema as Schema).properties ?? {}
  for (const [key, field] of Object.entries(fields)) {
    assert.ok(field.title, `${where}.${key} has a title`)
    assert.ok(field.description, `${where}.${key} has a description`)
    for (const choice of field.enum ?? []) assert.ok(field.enumLabels?.[choice], `${where}.${key}: ${choice} has a label`)
  }
  return fields
}

test("forms: titles, descriptions, choice labels; the password is secret; topics name new signals", async () => {
  const description = await PluginTestHost.describe(MqttPlugin)
  const config = checkFields(description.config, "config")
  assert.equal(config.password?.writeOnly, true)
  assert.equal(config.username?.writeOnly, undefined)
  assert.deepEqual(description.sensors.map(sensor => [sensor.id, sensor.valueType]), [["number", "number"], ["switch", "boolean"], ["text", "string"]])
  // an actuator's `accepts` is its valueType in the description
  assert.deepEqual(description.actuators.map(actuator => [actuator.id, actuator.valueType]), [["text", "any"], ["number", "number"], ["switch", "boolean"], ["json", "any"]])
  for (const capability of [...description.sensors, ...description.actuators]) {
    const fields = checkFields(capability.params, capability.id)
    assert.equal(fields.topic?.signalName, true, `${capability.id}: the topic names the signal`)
    assert.ok(capability.description, `${capability.id} has a description`)
  }
  assert.equal(description.watches?.label, "Exported signals")
})
