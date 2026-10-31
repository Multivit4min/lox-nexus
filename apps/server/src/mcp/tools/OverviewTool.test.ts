import assert from "node:assert/strict"
import { test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { InventoryService, InventorySignal } from "../../services/InventoryService.ts"
import { OverviewTool } from "./OverviewTool.ts"

const signal = (i: number): InventorySignal => ({
  id: `s${i}`, topic: `loxone/house/in/room-${i}-temperature`, label: `Room ${i} temperature`, owner: "miniserver:house", dir: "in",
  valueType: "number", unit: "°C", packetId: `room-${i}`, dataType: "Analog", value: Value.number(21.5), forced: false, stale: false, wires: 1
})
const inventory = (count: number) => ({
  signals: () => Array.from({ length: count }, (_, i) => signal(i)),
  miniservers: () => [], instances: () => [], packages: () => [], wires: () => [], forces: () => []
}) as unknown as InventoryService

test("the signal table comes along while it fits in one answer, and becomes a note when it doesn't, so the answer stays valid JSON", () => {
  const small = new OverviewTool(inventory(50), { version: "1", now: () => 0 }).run({ signals: true })
  assert.equal(typeof small.signals, "object")
  const large = new OverviewTool(inventory(3000), { version: "1", now: () => 0 }).run({ signals: true })
  assert.match(String(large.signals), /3000 signals: too many for one answer; use list_signals per owner/)
  assert.ok(JSON.stringify(large).length < 64 * 1024)
})
