import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { ClientNode } from "@matter/main"
import { LevelControlClient } from "@matter/main/behaviors/level-control"
import { OnOffClient } from "@matter/main/behaviors/on-off"
import { BridgeHarness } from "./test-support/BridgeHarness.ts"
import { TestController } from "./test-support/TestController.ts"

const { until, seen } = BridgeHarness
let bridge: BridgeHarness
let peer: ClientNode

before(async () => {
  bridge = await BridgeHarness.start([
    { name: "Lux", type: "light-sensor", battery: true },
    { name: "Air", type: "pressure-sensor" },
    { name: "Water", type: "flow-sensor" },
    { name: "Roof", type: "rain-sensor" },
    { name: "Pipe", type: "water-freeze-detector" },
    { name: "Outside", type: "temperature-sensor", battery: true },
    { name: "Socket", type: "dimmable-plug" },
    { name: "Wall", type: "wall-switch" },
    { name: "Wall dimmer", type: "wall-dimmer" }
  ])
  peer = await bridge.pair()
})
after(() => bridge.close())

const device = (name: string) => TestController.device(peer, name)
const actuate = async (capability: string, name: string, value: Value) => bridge.host.actuate(await bridge.host.addActuator(capability, { device: name }), value)

test("measurements from Nexus reach the controller in Matter's units", { timeout: 20_000 }, async () => {
  await actuate("illuminance", "Lux", Value.number(1000))
  await actuate("pressure", "Air", Value.number(1013))
  await actuate("flow", "Water", Value.number(1.5))
  await until(() => seen(peer, "Lux").illuminanceMeasurement?.measuredValue === 30001, 3000, "1000 lx")
  await until(() => seen(peer, "Air").pressureMeasurement?.measuredValue === 1013, 3000, "1013 hPa")
  await until(() => seen(peer, "Water").flowMeasurement?.measuredValue === 15, 3000, "1.5 m³/h")
})

test("rain and frost from Nexus reach the controller", { timeout: 20_000 }, async () => {
  await actuate("rain", "Roof", Value.boolean(true))
  await actuate("freeze", "Pipe", Value.boolean(true))
  await until(() => seen(peer, "Roof").booleanState?.stateValue === true, 3000, "rain")
  await until(() => seen(peer, "Pipe").booleanState?.stateValue === true, 3000, "frost")
})

test("battery: a sensor added with one shows its level and warns when low; others have none", { timeout: 20_000 }, async () => {
  await actuate("battery", "Outside", Value.number(15))
  await until(() => seen(peer, "Outside").powerSource?.batPercentRemaining === 30, 3000, "15 %")
  assert.equal(seen(peer, "Outside").powerSource?.batChargeLevel, 1, "warning")
  assert.equal(seen(peer, "Air").powerSource, undefined)
  const failing = await bridge.host.addActuator("battery", { device: "Air" })
  await assert.rejects(bridge.host.actuate(failing, Value.number(50)), /has no battery state/)
})

test("battery: the level is remembered across a restart", { timeout: 30_000 }, async () => {
  await actuate("battery", "Lux", Value.number(70))
  await until(() => seen(peer, "Lux").powerSource?.batPercentRemaining === 140, 3000, "70 %")
  bridge.host.plugin.coalescer.flush()
  await bridge.restart()
  assert.equal((bridge.state("Lux").powerSource as { batPercentRemaining?: number }).batPercentRemaining, 140)
})

test("dimmable plug and wall switches: commands from a controller reach the sensors", { timeout: 20_000 }, async () => {
  const socket = await bridge.host.addSensor("brightness", { device: "Socket" })
  const wall = await bridge.host.addSensor("on-off", { device: "Wall" })
  const dimmer = await bridge.host.addSensor("brightness", { device: "Wall dimmer" })
  await device("Socket").commandsOf(LevelControlClient).moveToLevelWithOnOff({ level: 127, transitionTime: null, optionsMask: {}, optionsOverride: {} })
  await device("Wall").commandsOf(OnOffClient).on()
  await device("Wall dimmer").commandsOf(OnOffClient).on()
  await until(() => bridge.last(socket) === 50, 3000, "plug at 50 %")
  await until(() => bridge.last(wall) === true, 3000, "wall switch on")
  await until(() => bridge.last(dimmer) === 100, 3000, "wall dimmer on")
})
