import assert from "node:assert/strict"
import { test } from "node:test"
import { KindFormat } from "../panel/KindFormat.ts"
import { WriteCoalescer } from "../matter/WriteCoalescer.ts"
import { MemoryStore } from "../test-support/MemoryStore.ts"
import { BridgedDimmer } from "./BridgedDimmer.ts"
import { DeviceIdentity } from "./DeviceIdentity.ts"
import { DeviceMemory } from "./DeviceMemory.ts"

test("brightness % and Matter levels (1–254) map both ways; 1 % stays on", () => {
  assert.deepEqual([0.1, 1, 50, 100, 150].map(BridgedDimmer.level), [1, 3, 127, 254, 254])
  assert.deepEqual([1, 2, 127, 254].map(BridgedDimmer.percent), [1, 1, 50, 100])
})

test("a device's identity follows its name and type; its serial number differs from its unique id", () => {
  const kitchen = new DeviceIdentity({ name: "Kitchen", type: "dimmable-light" })
  assert.deepEqual(new DeviceIdentity({ name: "Kitchen", type: "dimmable-light" }), kitchen)
  assert.notEqual(new DeviceIdentity({ name: "Kitchen", type: "plug" }).endpointId, kitchen.endpointId)
  assert.notEqual(new DeviceIdentity({ name: "Kitchen 2", type: "dimmable-light" }).uniqueId, kitchen.uniqueId)
  assert.notEqual(kitchen.serialNumber, kitchen.uniqueId)
  assert.ok(kitchen.uniqueId.length <= 32 && kitchen.serialNumber.length <= 32)
  assert.match(kitchen.endpointId, /^device-[0-9a-f]{16}$/)
})

test("the states matter.js doesn't persist are remembered, only on change, and coalesced", () => {
  const store = new MemoryStore()
  const scheduled: (() => void)[] = []
  const memory = new DeviceMemory(store, new WriteCoalescer((_ms, run) => (scheduled.push(run), () => {})))
  memory.remember("a", "contact", true)
  memory.remember("a", "contact", true)
  memory.remember("a", "temperature", 21)
  memory.remember("a", "temperature", 21.5)
  memory.remember("a", "onOff", true)
  assert.equal(store.writes, 0)
  scheduled[0]!()
  assert.equal(store.writes, 1)
  assert.deepEqual(store.get("state:a"), { contact: true, temperature: 21.5 })
  assert.equal(new DeviceMemory(store).get("a", "temperature"), 21.5)
  assert.equal(memory.get("a", "onOff"), undefined, "matter.js persists on/off itself")
  memory.keepOnly(["b"])
  assert.equal(new DeviceMemory(store).get("a", "contact"), undefined)
})

test("a damaged remembered state is ignored", () => {
  const store = new MemoryStore()
  store.set("state:a", { contact: "yes" })
  assert.equal(new DeviceMemory(store).get("a", "contact"), undefined)
})

test("panel values read naturally", () => {
  assert.deepEqual([
    KindFormat.value("onOff", true), KindFormat.value("contact", false), KindFormat.value("occupancy", true),
    KindFormat.value("temperature", 21.53), KindFormat.value("setpoint", 20), KindFormat.value("position", 30),
    KindFormat.labeled("setpoint", 21), KindFormat.labeled("onOff", false)
  ], ["on", "closed", "occupied", "21.5 °C", "20 °C", "30 %", "heating setpoint 21 °C", "off"])
})
