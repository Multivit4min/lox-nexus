import assert from "node:assert/strict"
import { test } from "node:test"
import { HaDiscovery } from "./HaDiscovery.ts"

const discovery = new HaDiscovery("homeassistant", { instanceId: "i", name: "Lox Nexus" }, undefined)
const config = (signal: Parameters<HaDiscovery["payload"]>[0]) => JSON.parse(discovery.payload(signal, "t")) as Record<string, unknown>

test("a number signal's unit and decimals go to Home Assistant; a colour's template keeps its own %", () => {
  const power = config({ id: "p", topic: "x/p", label: "Power", valueType: "number", unit: "W", decimals: 1 })
  assert.deepEqual([power.unit_of_measurement, power.suggested_display_precision, power.state_class], ["W", 1, "measurement"])
  const plain = config({ id: "n", topic: "x/n", label: "Count", valueType: "number" })
  assert.deepEqual([plain.unit_of_measurement, plain.suggested_display_precision], [undefined, undefined])
  const light = config({ id: "l", topic: "x/l", label: "Light", valueType: "tunableWhite", unit: "‰" })
  assert.equal(light.unit_of_measurement, "%")
})
