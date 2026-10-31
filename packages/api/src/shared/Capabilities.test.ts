import assert from "node:assert/strict"
import { test } from "node:test"
import type { PluginDescription } from "@lox-nexus/plugin-sdk/wire"
import { Capabilities } from "./Capabilities.ts"

const description = {
  config: {},
  sensors: [{ id: "state", label: "State", params: {}, valueType: "number" }],
  actuators: [{ id: "state", label: "Set", params: {}, valueType: "boolean" }]
} satisfies PluginDescription

test("a capability is looked up by kind and id; a missing plugin offers nothing", () => {
  assert.equal(Capabilities.of(description, { kind: "actuator", capability: "state" })?.label, "Set")
  assert.equal(Capabilities.of(description, { kind: "sensor", capability: "gone" }), undefined)
  assert.deepEqual(Capabilities.offered(undefined, "sensor"), [])
})
