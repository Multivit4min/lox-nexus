import assert from "node:assert/strict"
import { test } from "node:test"
import type { PluginSignalDto } from "@lox-nexus/api"
import type { PluginDescription } from "@lox-nexus/plugin-sdk/wire"
import { SignalGroups } from "./SignalGroups.ts"

const marked = { type: "object", properties: { entityId: { type: "string", signalGroup: true }, attribute: { type: "string" } } }
const description: PluginDescription = {
  config: {},
  sensors: [{ id: "state", label: "State", params: marked, valueType: "any" }, { id: "event", label: "Event", params: { type: "object", properties: { event: { type: "string" } } }, valueType: "any" }],
  actuators: [{ id: "onoff", label: "On/off", params: marked, valueType: "boolean" }]
}
const signal = (id: string, kind: "sensor" | "actuator", capability: string, params: Record<string, unknown>) =>
  ({ id, kind, capability, params, label: id, topic: `ha/home/${kind}/${id}` }) as unknown as PluginSignalDto

const signals = [
  signal("a", "sensor", "state", { entityId: "light.kitchen" }),
  signal("b", "sensor", "event", { event: "doorbell" }),
  signal("c", "actuator", "onoff", { entityId: "light.kitchen" }),
  signal("d", "sensor", "state", { entityId: "sensor.outside" }),
  signal("e", "sensor", "state", { entityId: "light.kitchen", attribute: "brightness" })
]
const shape = (rows: ReturnType<SignalGroups["rows"]>) => rows.map(row => row.type === "group" ? `[${row.label}: ${row.ids.join(",")}${row.open ? "" : " closed"}]` : `${row.inGroup ? "  " : ""}${row.signal.id}`)

test("signals with the same marked param form a group at the first member's place; single and unmarked signals stay plain", () => {
  const groups = new SignalGroups(description)
  assert.deepEqual(shape(groups.rows(signals, new Set())), ["[light.kitchen: a,c,e]", "  a", "  c", "  e", "b", "d"])
  assert.equal(groups.of(signals[1]!), undefined)
})

test("a collapsed group shows its header only", () => {
  assert.deepEqual(shape(new SignalGroups(description).rows(signals, new Set(["light.kitchen"]))), ["[light.kitchen: a,c,e closed]", "b", "d"])
})

test("several marked params form a path; empty values are left out", () => {
  const path = { type: "object", properties: { node: { type: "string", signalGroup: true }, endpoint: { type: "integer", signalGroup: true } } }
  const groups = new SignalGroups({ config: {}, sensors: [{ id: "level", label: "Level", params: path, valueType: "number" }], actuators: [] })
  assert.equal(groups.of(signal("x", "sensor", "level", { node: "Hue bridge", endpoint: 11 })), "Hue bridge ▸ 11")
  assert.equal(groups.of(signal("y", "sensor", "level", { node: "Hue bridge", endpoint: null })), "Hue bridge")
  assert.equal(groups.of(signal("z", "sensor", "level", {})), undefined)
})
