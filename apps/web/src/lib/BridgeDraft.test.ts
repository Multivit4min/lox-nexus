import assert from "node:assert/strict"
import { test } from "node:test"
import type { LoxoneSignalDto, PluginSignalDto, WireDto } from "@lox-nexus/api"
import type { PluginDescription } from "@lox-nexus/plugin-sdk/wire"
import { BridgeDraft } from "./BridgeDraft.ts"

const description = {
  sensors: [{ id: "state", label: "State", valueType: "boolean", params: {} }],
  actuators: [{ id: "brightness", label: "Brightness", valueType: "singleChannel", params: {} }]
} as unknown as PluginDescription

test("candidates from signals and catalog entries carry their value type", () => {
  const signal = { id: "s1", label: "Door", kind: "sensor", valueType: "string" } as PluginSignalDto
  assert.deepEqual(BridgeDraft.fromSignal(signal), { key: "s1", label: "Door", kind: "sensor", valueType: "string", plugin: { type: "existing", signalId: "s1" } })
  const entry = BridgeDraft.fromEntry("k", { kind: "actuator", capability: "brightness", params: { entityId: "light.a" }, label: "Lamp" }, description)
  assert.deepEqual(entry, {
    key: "k", label: "Lamp", kind: "actuator", valueType: "singleChannel",
    plugin: { type: "new", signal: { kind: "actuator", capability: "brightness", params: { entityId: "light.a" }, label: "Lamp" } }
  })
})

test("rows get free packet ids and a fitting data type; the request trims and falls back to the signal's name", () => {
  const candidates = ["Garden Light", "Garden Light", "Mystery"].map((label, i) => ({
    key: String(i), label, kind: "sensor" as const, valueType: (["boolean", "number", "any"] as const)[i]!, plugin: { type: "existing" as const, signalId: String(i) }
  }))
  const rows = BridgeDraft.rows(candidates, ["gardligh"])
  assert.deepEqual(rows.map(r => [r.packetId, r.dataType]), [["gardlig2", 0], ["gardlig3", 1], ["mystery", 1]])
  rows[0]!.packetId = " gl "
  rows[1]!.label = "  "
  const request = BridgeDraft.request("ms", rows)
  assert.deepEqual(request.items.slice(0, 2).map(item => item.loxone), [
    { packetId: "gl", dataType: 0, label: "Garden Light" }, { packetId: "gardlig3", dataType: 1, label: "Garden Light" }
  ])
})

test("existing signals already wired to the Miniserver's signals are found, in their direction", () => {
  const candidate = (key: string, kind: "sensor" | "actuator") => ({ key, label: key, kind, valueType: "number" as const, plugin: { type: "existing" as const, signalId: key } })
  const wires = [["s", "lox1"], ["s", "other"], ["lox2", "a"], ["a", "lox1"]].map(([sourceId, targetId]) => ({ sourceId, targetId }) as WireDto)
  const loxone = [{ id: "lox1", packetId: "p1" }, { id: "lox2", packetId: "p2" }] as LoxoneSignalDto[]
  const found = BridgeDraft.connected([candidate("s", "sensor"), candidate("a", "actuator"), candidate("x", "sensor")], wires, loxone)
  assert.deepEqual([...found], [["s", ["p1"]], ["a", ["p2"]]])
})
