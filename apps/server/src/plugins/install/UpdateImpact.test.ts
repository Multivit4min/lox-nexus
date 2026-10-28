import assert from "node:assert/strict"
import { test } from "node:test"
import type { PluginDescription } from "@lox-nexus/plugin-sdk/wire"
import { UpdateImpact } from "./UpdateImpact.ts"

const description = (overrides: Partial<Record<"config" | "sensors" | "actuators", unknown>>) =>
  ({ config: { type: "object", properties: {} }, sensors: [], actuators: [], ...overrides }) as unknown as PluginDescription
const capability = (id: string, valueType: string) => ({ id, label: id, params: {}, valueType })
const signal = (kind: "sensor" | "actuator", capability: string, id = capability) => ({ id, kind, capability, params: {}, label: id, slug: id })

test("removed and retyped capabilities count the signals using them; unused ones are listed too", () => {
  const current = description({ sensors: [capability("a", "number"), capability("b", "number"), capability("c", "string")], actuators: [capability("set", "number")] })
  const next = description({ sensors: [capability("a", "string"), capability("c", "string")], actuators: [] })
  const instance = { id: "i1", label: "One", state: "running" as const }
  const impact = UpdateImpact.of(next, current, [{ instance, signals: [signal("sensor", "a"), signal("sensor", "b"), signal("sensor", "b", "b2"), signal("actuator", "set")] }])
  assert.deepEqual(impact.instances, [instance])
  assert.deepEqual(impact.removed, [{ kind: "sensor", capability: "b", signals: 2 }, { kind: "actuator", capability: "set", signals: 1 }])
  assert.deepEqual(impact.retyped, [{ kind: "sensor", capability: "a", signals: 1, from: "number", to: "string" }])
})

test("settings the new version requires without a default, that the old one didn't know", () => {
  const current = description({ config: { type: "object", properties: { host: {} }, required: ["host"] } })
  const next = description({
    config: { type: "object", properties: { host: {}, token: {}, port: { default: 80 }, unit: {} }, required: ["host", "token", "port"] }
  })
  assert.deepEqual(UpdateImpact.of(next, current, []).newRequiredConfig, ["token"])
  // a first install of a plugin that existing instances wait for compares against nothing
  assert.deepEqual(UpdateImpact.of(next, undefined, []).newRequiredConfig, ["host", "token"])
})

test("an optional field that becomes required, an unknown current version, and a malformed schema", () => {
  const current = description({ config: { type: "object", properties: { host: {}, port: {} }, required: ["host"] } })
  const next = description({ config: { type: "object", properties: { host: {}, port: {} }, required: ["host", "port"] } })
  assert.deepEqual(UpdateImpact.of(next, current, []).newRequiredConfig, ["port"])
  const instance = { id: "i1", label: "One", state: "running" as const }
  // nothing known about the active version: what the signals use and the next version lacks is removed
  const unknown = UpdateImpact.of(description({ sensors: [capability("a", "number")] }), undefined, [{ instance, signals: [signal("sensor", "a"), signal("sensor", "gone")] }])
  assert.deepEqual(unknown.removed, [{ kind: "sensor", capability: "gone", signals: 1 }])
  assert.deepEqual(UpdateImpact.of(description({ config: { required: "not a list", properties: 3 } }), current, []).newRequiredConfig, [])
})
