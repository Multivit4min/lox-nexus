import assert from "node:assert/strict"
import { test } from "node:test"
import { Actuator } from "../plugin/Actuator.ts"
import { Plugin } from "../plugin/Plugin.ts"
import { Sensor } from "../plugin/Sensor.ts"
import { CapabilityDescriptionSchema } from "../wire/Shapes.ts"
import { Declarations } from "./Declarations.ts"

const sensorWith = (staleAfterMs: number) => class extends Sensor<Plugin, object> {
  static readonly id = "s"
  static readonly staleAfterMs = staleAfterMs
}

test("a sensor's stale suggestion is whole minutes rounded up; nonsense is left out", () => {
  assert.deepEqual(Declarations.display(sensorWith(90_000), "sensor"), { staleAfterMin: 2 })
  for (const nonsense of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 10_081 * 60_000]) {
    assert.deepEqual(Declarations.display(sensorWith(nonsense), "sensor"), {}, String(nonsense))
  }
  class Pump extends Actuator<Plugin, object> {
    static readonly id = "pump"
    static readonly staleAfterMs = 60_000
    run() {}
  }
  assert.deepEqual(Declarations.display(Pump, "actuator"), {}, "actuators never go stale")
})

test("descriptions with a stale suggestion parse; an invalid one is dropped, not fatal", () => {
  const base = { id: "s", label: "S", params: {}, valueType: "number" }
  assert.equal(CapabilityDescriptionSchema.parse({ ...base, staleAfterMin: 5 }).staleAfterMin, 5)
  assert.equal(CapabilityDescriptionSchema.parse({ ...base, staleAfterMin: 0 }).staleAfterMin, undefined)
  assert.equal("staleAfterMin" in CapabilityDescriptionSchema.parse(base), false, "older plugins send none")
})
