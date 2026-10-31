import assert from "node:assert/strict"
import { test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { AddDeviceAction } from "../actions/AddDeviceAction.ts"
import { DeviceGroups } from "./DeviceGroups.ts"
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
  // add-device is a union by kind of device; close types share one with a second choice
  const branches = (actions[0]!.input as { oneOf: Schema[] }).oneOf
  const fieldNames = DeviceGroups.all.flatMap(group => group.choice ? [group.choice.field] : [])
  assert.equal(new Set(fieldNames).size, fieldNames.length, "each group's second choice has a field of its own")
  const types = branches.flatMap(branch => {
    const choice = Object.entries(checkFields(branch, "add-device")).find(([key]) => fieldNames.includes(key))?.[1]
    return choice ? Object.keys(choice.enumLabels ?? {}) : branch.properties!.type!.enum!.map(String)
  })
  assert.deepEqual([...types].sort(), [...DEVICE_TYPE_IDS].sort(), "every type exactly once")
  assert.ok(branches.length <= 20, `${branches.length} choices`)
  for (const branch of branches) {
    const fields = Object.keys(branch.properties ?? {}).filter(field => !fieldNames.includes(field))
    const type = String(branch.properties!.type!.enum![0])
    assert.equal(branch.properties!.type!.title, "Type", "the form takes the choice's title and description from it")
    if (type === "door-lock") assert.deepEqual(fields, ["type", "name", "allowUnlock"])
    else if (["sensors", "contact-sensor", "occupancy-sensor", "water-sensors", "buttons"].includes(type)) assert.deepEqual(fields, ["type", "name", "battery"], type)
    else assert.deepEqual(fields, ["type", "name"], type)
  }
  assert.ok(actions.find(action => action.id === "remove-device")?.confirm)
  assert.ok(actions.find(action => action.id === "remove-pairing")?.confirm)
})

test("add-device input: each kind of branch parses; a lock's unlocking and a battery only where the type has them", () => {
  const parse = (input: unknown) => AddDeviceAction.input.parse(input)
  assert.deepEqual(parse({ type: "lights", light: "on-off-light", name: "Hall" }), { type: "lights", light: "on-off-light", name: "Hall" })
  assert.throws(() => parse({ type: "lights", name: "Hall" }), "the second choice is required")
  assert.throws(() => parse({ type: "lights", light: "plug", name: "X" }), "a kind of another group")
  assert.deepEqual(parse({ type: "door-lock", name: "Front" }), { type: "door-lock", name: "Front", allowUnlock: false })
  assert.deepEqual(parse({ type: "sensors", sensor: "humidity-sensor", name: "Out", battery: true }), { type: "sensors", sensor: "humidity-sensor", name: "Out", battery: true })
  assert.deepEqual(parse({ type: "plugs", plug: "plug", name: "Hall", battery: true, allowUnlock: true }), { type: "plugs", plug: "plug", name: "Hall" }, "fields of other types are dropped")
  assert.throws(() => parse({ type: "spaceship", name: "X" }))
  assert.equal(DeviceGroups.type({ type: "thermostats", thermostat: "thermostat-heat-cool" }), "thermostat-heat-cool")
  assert.equal(DeviceGroups.type({ type: "chime" }), "chime")
  assert.throws(() => DeviceGroups.type({ type: "plug" }), /unknown device type "plug"/, "a type's id is no group of several")
  assert.throws(() => DeviceGroups.type({ type: "thermostats" }), /pick a kind of thermostat/)
})
