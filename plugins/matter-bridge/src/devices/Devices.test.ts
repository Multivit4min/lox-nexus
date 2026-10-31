import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { test } from "node:test"
import { KindFormat } from "../panel/KindFormat.ts"
import { WriteCoalescer } from "../matter/WriteCoalescer.ts"
import { MemoryStore } from "../test-support/MemoryStore.ts"
import { BatteryServer } from "./BatteryServer.ts"
import { BridgedDimmer } from "./BridgedDimmer.ts"
import { BridgedFlow } from "./BridgedFlow.ts"
import { BridgedIlluminance } from "./BridgedIlluminance.ts"
import { BridgedPressure } from "./BridgedPressure.ts"
import { ColorTemperature } from "./ColorTemperature.ts"
import { DeviceId } from "./DeviceId.ts"
import { DeviceIdentity } from "./DeviceIdentity.ts"
import { DeviceMemory } from "./DeviceMemory.ts"
import { DeviceStore } from "./DeviceStore.ts"

test("brightness % and Matter levels (1–254) map both ways; 1 % stays on", () => {
  assert.deepEqual([0.1, 1, 50, 100, 150].map(BridgedDimmer.level), [1, 3, 127, 254, 254])
  assert.deepEqual([1, 2, 127, 254].map(BridgedDimmer.percent), [1, 1, 50, 100])
})

test("measurements convert to Matter's units; unknown stays unknown", () => {
  assert.deepEqual([undefined, 0, 0.5, 1, 10, 1000, 100_000, 1e9].map(BridgedIlluminance.measured), [null, 0, 0, 1, 10001, 30001, 50001, 0xfffe])
  assert.deepEqual([undefined, 1013.4, 99_999].map(BridgedPressure.measured), [null, 1013, 32767])
  assert.deepEqual([undefined, 1.25, -3].map(BridgedFlow.measured), [null, 13, 0])
})

test("battery levels count half percent; the charge level warns below 20 % and is critical below 10 %", () => {
  assert.deepEqual(BatteryServer.level(55), { batPercentRemaining: 110, batChargeLevel: 0, batReplacementNeeded: false })
  assert.deepEqual(BatteryServer.level(15), { batPercentRemaining: 30, batChargeLevel: 1, batReplacementNeeded: true })
  assert.deepEqual(BatteryServer.level(-5), { batPercentRemaining: 0, batChargeLevel: 2, batReplacementNeeded: true })
})

test("a device's identity follows its id, not its name; its serial number differs from its unique id", () => {
  const kitchen = new DeviceIdentity("kitchen-light-3f2a")
  assert.deepEqual(new DeviceIdentity("kitchen-light-3f2a"), kitchen)
  assert.notEqual(new DeviceIdentity("kitchen-light-3f2b").uniqueId, kitchen.uniqueId)
  assert.notEqual(kitchen.serialNumber, kitchen.uniqueId)
  assert.ok(kitchen.uniqueId.length <= 32 && kitchen.serialNumber.length <= 32)
  assert.match(kitchen.endpointId, /^device-[0-9a-f]{16}$/)
  // devices taken over from the old config keep the identity they had (type and name)
  assert.equal(new DeviceIdentity("dimmable-light\nKitchen").endpointId, `device-${createHash("sha256").update("dimmable-light\nKitchen").digest("hex").slice(0, 16)}`)
})

test("new ids: the name as a slug and a short random suffix, never one that is taken", () => {
  assert.equal(DeviceId.slug("Küche Decke (groß)"), "kuche-decke-gross")
  assert.equal(DeviceId.slug("Žluťoučký kůň"), "zlutoucky-kun")
  assert.equal(DeviceId.slug("!!!"), "device")
  assert.equal(DeviceId.slug("A very long name for a light in the hall"), "a-very-long-name-for-a-l")
  const suffixes = ["3f2a", "3f2a", "77b0"]
  assert.equal(DeviceId.create("Kitchen light", new Set(["kitchen-light-3f2a"]), () => suffixes.shift()!), "kitchen-light-77b0")
  assert.match(DeviceId.create("Kitchen light", new Set()), /^kitchen-light-[0-9a-f]{4}$/)
})

test("colour temperatures convert between Kelvin and mireds and stay within 2700–6500 K", () => {
  assert.deepEqual([2700, 4000, 6500, 2000, 9000].map(ColorTemperature.mireds), [370, 250, 154, 370, 154])
  assert.deepEqual([370, 333, 250, 154, 100, 500].map(ColorTemperature.kelvin), [2700, 3000, 4000, 6500, 6500, 2700])
  for (const kelvin of [2700, 3000, 4000, 5000, 6500]) assert.equal(ColorTemperature.kelvin(ColorTemperature.mireds(kelvin)), kelvin, `${kelvin} K round-trips`)
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
    KindFormat.labeled("setpoint", 21), KindFormat.labeled("onOff", false), KindFormat.value("colorTemperature", 3000),
    KindFormat.value("tunableWhite", { temperature: 3000, brightness: 40 }), KindFormat.value("lock", false), KindFormat.value("smoke", true),
    KindFormat.value("illuminance", 320), KindFormat.labeled("battery", 80), KindFormat.value("freeze", true)
  ], ["on", "closed", "occupied", "21.5 °C", "20 °C", "30 %", "heating setpoint 21 °C", "off", "3000 K", "3000 K, 40 %", "unlock", "smoke alarm",
    "320 lx", "battery 80 %", "frost"])
})

test("stored devices are checked like new ones: a damaged entry is skipped with a warning, the rest load", () => {
  const store = new MemoryStore()
  const warnings: string[] = []
  const log = { debug() {}, info() {}, warn: (message: string) => warnings.push(message), error() {} }
  store.set("devices", [
    { id: "a", name: "Hall", type: "plug" },
    { id: "b", name: "Ä".repeat(17), type: "plug" },
    { id: "c", name: "Garage", type: "spaceship" }
  ])
  assert.deepEqual(new DeviceStore(store, log).load().map(record => record.id), ["a"])
  assert.equal(warnings.length, 2)
})
