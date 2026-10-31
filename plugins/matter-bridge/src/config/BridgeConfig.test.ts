import assert from "node:assert/strict"
import { test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { MatterBridgePlugin } from "../MatterBridgePlugin.ts"
import { bridgeConfigSchema } from "./BridgeConfig.ts"

const issues = (config: unknown) => {
  const result = bridgeConfigSchema.safeParse(config)
  return result.success ? [] : result.error.issues.map(issue => issue.message)
}

test("defaults: the name Alexa shows and port 5540; devices are not settings any more", () => {
  assert.deepEqual(bridgeConfigSchema.parse({}), { name: "Lox Nexus", port: 5540 })
  // the config migration has taken an old list out before validation; what is left over is dropped
  assert.deepEqual(bridgeConfigSchema.parse({ devices: [{ name: "x", type: "nope" }] }), { name: "Lox Nexus", port: 5540 })
})

test("the bridge name is at most 32 bytes; the port above 1023", () => {
  assert.deepEqual(issues({ name: "Ä".repeat(17) }), ["at most 32 bytes (letters like ä or é count twice)"])
  assert.deepEqual(issues({ name: "Ä".repeat(16) }), [])
  assert.equal(issues({ name: " " }).length, 1)
  assert.equal(issues({ port: 80 }).length, 1)
})

type Field = { title?: string; description?: string; enum?: string[]; enumLabels?: Record<string, string>; signalGroup?: boolean }
type Schema = { properties?: Record<string, Field> }

/** every field has a title and a description, every choice a label */
function checkFields(schema: unknown, where: string) {
  const fields = (schema as Schema).properties ?? {}
  for (const [key, field] of Object.entries(fields)) {
    assert.ok(field.title && field.description, `${where}.${key}`)
    for (const choice of field.enum ?? []) assert.ok(field.enumLabels?.[choice], `${where}.${key}: ${choice}`)
  }
  return fields
}

test("forms: fields, params and action inputs have titles, descriptions and labels; the device param groups signals", async () => {
  const description = await PluginTestHost.describe(MatterBridgePlugin)
  assert.deepEqual(Object.keys(checkFields(description.config, "config")), ["name", "port"])
  for (const capability of [...description.sensors, ...description.actuators]) {
    assert.ok(capability.description, capability.id)
    assert.equal(checkFields(capability.params, capability.id).device?.signalGroup, true, capability.id)
  }
  const actions = description.actions ?? []
  assert.deepEqual(actions.map(action => action.id), ["add-device", "edit-device", "edit-lock", "remove-device", "open-pairing-window", "remove-pairing"])
  assert.ok(actions.every(action => action.placement === "panel"), "every button is in the panel: above its section or on its row")
  for (const action of actions.slice(1)) checkFields(action.input, action.id)
  // add-device is a union by type: the other types, sensors and buttons with Battery, and the door lock with Allow unlocking
  const [others, battery, lock] = (actions[0]!.input as { oneOf: Schema[] }).oneOf
  assert.equal(Object.keys(checkFields(others, "add-device").type?.enumLabels ?? {}).length, 11)
  assert.equal(Object.keys(checkFields(battery, "add-device").type?.enumLabels ?? {}).length, 11)
  assert.deepEqual(Object.keys(battery!.properties ?? {}), ["type", "name", "battery"])
  assert.deepEqual(Object.keys(lock!.properties ?? {}), ["type", "name", "allowUnlock"])
  assert.equal(lock!.properties!.type!.title, "Door lock")
  assert.ok(actions.find(action => action.id === "remove-device")?.confirm)
  assert.ok(actions.find(action => action.id === "remove-pairing")?.confirm)
})
