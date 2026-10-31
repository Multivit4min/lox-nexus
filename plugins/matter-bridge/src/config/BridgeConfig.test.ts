import assert from "node:assert/strict"
import { test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { DEVICE_TYPE_IDS } from "../devices/DeviceKinds.ts"
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
  // add-device is a union by type, in runs of types with the same fields, in the types' order
  const branches = (actions[0]!.input as { oneOf: Schema[] }).oneOf
  const types = branches.map(branch => Object.keys(checkFields(branch, "add-device").type?.enumLabels ?? {}))
  assert.deepEqual(types.flat(), [...DEVICE_TYPE_IDS])
  for (const [index, branch] of branches.entries()) {
    const fields = Object.keys(branch.properties ?? {})
    if (types[index]!.includes("door-lock")) assert.deepEqual(fields, ["type", "name", "allowUnlock"])
    else if (types[index]!.includes("temperature-sensor") || types[index]!.includes("doorbell")) assert.deepEqual(fields, ["type", "name", "battery"])
    else assert.deepEqual(fields, ["type", "name"], types[index]!.join())
  }
  assert.ok(actions.find(action => action.id === "remove-device")?.confirm)
  assert.ok(actions.find(action => action.id === "remove-pairing")?.confirm)
})
