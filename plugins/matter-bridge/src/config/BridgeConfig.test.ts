import assert from "node:assert/strict"
import { test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { MatterBridgePlugin } from "../MatterBridgePlugin.ts"
import { bridgeConfigSchema } from "./BridgeConfig.ts"

const issues = (config: unknown) => {
  const result = bridgeConfigSchema.safeParse(config)
  return result.success ? [] : result.error.issues.map(issue => issue.message)
}

test("defaults: the name Alexa shows, port 5540, no devices", () => {
  assert.deepEqual(bridgeConfigSchema.parse({}), { name: "Lox Nexus", port: 5540, devices: [] })
})

test("device names are unique, compared like Alexa does (case-insensitive)", () => {
  assert.deepEqual(issues({ devices: [{ name: "Kitchen", type: "plug" }, { name: "kitchen ", type: "on-off-light" }] }), ["the device name \"kitchen\" is used twice"])
  assert.deepEqual(issues({ devices: [{ name: "Kitchen", type: "plug" }, { name: "Hall", type: "plug" }] }), [])
})

test("at most 50 devices, Alexa's limit for one bridge", () => {
  const devices = (count: number) => Array.from({ length: count }, (_, index) => ({ name: `Light ${index}`, type: "on-off-light" }))
  assert.deepEqual(issues({ devices: devices(50) }), [])
  assert.deepEqual(issues({ devices: devices(51) }), ["at most 50 devices (Alexa's limit for one bridge)"])
})

test("unknown types, empty names and names over 32 bytes are refused", () => {
  assert.equal(issues({ devices: [{ name: "Fan", type: "fan" }] }).length, 1)
  assert.equal(issues({ devices: [{ name: " ", type: "plug" }] }).length, 1)
  assert.deepEqual(issues({ devices: [{ name: "Ä".repeat(17), type: "plug" }] }), ["at most 32 bytes (letters like ä or é count twice)"])
  assert.deepEqual(issues({ devices: [{ name: "Ä".repeat(16), type: "plug" }] }), [])
  assert.equal(issues({ port: 80 }).length, 1)
})

test("an invalid config fails the start with the reason", async () => {
  await assert.rejects(PluginTestHost.start(MatterBridgePlugin, { config: { devices: [{ name: "A", type: "plug" }, { name: "a", type: "plug" }] } }), /used twice/)
})

test("forms: every field and param has a title and a description, every type a label; the device param groups signals", async () => {
  const description = await PluginTestHost.describe(MatterBridgePlugin)
  type Field = { title?: string; description?: string; enum?: string[]; enumLabels?: Record<string, string>; signalGroup?: boolean; items?: { properties?: Record<string, Field> } }
  const fields = (description.config as { properties: Record<string, Field> }).properties
  for (const [key, field] of Object.entries(fields)) assert.ok(field.title && field.description, key)
  const device = fields.devices?.items?.properties ?? {}
  assert.ok(device.name?.title && device.type?.title)
  for (const type of device.type?.enum ?? []) assert.ok(device.type?.enumLabels?.[type], type)
  for (const capability of [...description.sensors, ...description.actuators]) {
    assert.ok(capability.description, capability.id)
    const params = (capability.params as { properties: Record<string, Field> }).properties
    assert.equal(params.device?.signalGroup, true, capability.id)
  }
  assert.deepEqual(description.actions?.map(action => action.id), ["open-pairing-window", "remove-pairing"])
  assert.ok(description.actions?.[1]?.confirm)
})
