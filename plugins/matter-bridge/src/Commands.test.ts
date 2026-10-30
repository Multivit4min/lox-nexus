import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { ClientNode } from "@matter/main"
import { LevelControlClient } from "@matter/main/behaviors/level-control"
import { OnOffClient } from "@matter/main/behaviors/on-off"
import { ThermostatClient } from "@matter/main/behaviors/thermostat"
import { WindowCoveringClient } from "@matter/main/behaviors/window-covering"
import { Thermostat } from "@matter/main/clusters/thermostat"
import { BridgeHarness } from "./test-support/BridgeHarness.ts"
import { TestController } from "./test-support/TestController.ts"

const { until, seen } = BridgeHarness
let bridge: BridgeHarness
let peer: ClientNode

before(async () => {
  bridge = await BridgeHarness.start([
    { name: "Kitchen", type: "dimmable-light" },
    { name: "Blind", type: "window-covering" },
    { name: "Heating", type: "thermostat" }
  ])
  peer = await bridge.pair()
})
after(() => bridge.close())

const writes = () => bridge.host.sent.filter(message => message.type === "store.set").length
const device = (name: string) => TestController.device(peer, name)

test("dimmer: on, a level, on at a level from off, and off reach the sensors once each", { timeout: 20_000 }, async () => {
  const onOff = await bridge.host.addSensor("on-off", { device: "Kitchen" })
  const brightness = await bridge.host.addSensor("brightness", { device: "Kitchen" })
  const commands = device("Kitchen").commandsOf(LevelControlClient)
  await device("Kitchen").commandsOf(OnOffClient).on()
  await until(() => bridge.last(brightness) === 100, 3000, "on at full brightness")
  await commands.moveToLevel({ level: 127, transitionTime: null, optionsMask: {}, optionsOverride: {} })
  await until(() => bridge.last(brightness) === 50, 3000, "brightness 50")
  await device("Kitchen").commandsOf(OnOffClient).off()
  await until(() => bridge.last(onOff) === false && bridge.last(brightness) === 0, 3000, "off is brightness 0")
  // one action changes on/off and the level: the brightness goes out once
  await commands.moveToLevelWithOnOff({ level: 76, transitionTime: null, optionsMask: {}, optionsOverride: {} })
  await until(() => bridge.last(onOff) === true, 3000, "on again")
  assert.deepEqual(bridge.values(brightness), [100, 50, 0, 30])
  assert.deepEqual(bridge.values(onOff), [true, false, true])
})

test("blind: go to, stop, open and close become target positions; stop sends where Nexus last saw it", { timeout: 20_000 }, async () => {
  const target = await bridge.host.addSensor("position", { device: "Blind" })
  const position = await bridge.host.addActuator("position", { device: "Blind" })
  const commands = device("Blind").commandsOf(WindowCoveringClient)
  await bridge.host.actuate(position, Value.number(30))
  await until(() => seen(peer, "Blind").windowCovering?.currentPositionLiftPercent100ths === 3000, 3000, "30 % at the controller")
  await commands.goToLiftPercentage({ liftPercent100thsValue: 10000 })
  await until(() => bridge.last(target) === 100, 3000, "close to 100 %")
  await bridge.host.actuate(position, Value.number(60))
  await commands.stopMotion()
  await until(() => bridge.last(target) === 60, 3000, "stop at 60 %")
  await commands.upOrOpen()
  await until(() => bridge.last(target) === 0, 3000, "open")
  await bridge.host.actuate(position, Value.number(20))
  await commands.downOrClose()
  await until(() => bridge.last(target) === 100, 3000, "close")
  assert.deepEqual(bridge.values(target), [100, 60, 0, 100])
})

test("thermostat: a setpoint from a controller is a command; one from Nexus is shown and not echoed", { timeout: 20_000 }, async () => {
  const command = await bridge.host.addSensor("setpoint", { device: "Heating" })
  await device("Heating").commandsOf(ThermostatClient).setpointRaiseLower({ mode: Thermostat.SetpointRaiseLowerMode.Heat, amount: 15 })
  await until(() => bridge.last(command) === 21.5, 3000, "20 + 1.5 °C")
  await bridge.host.actuate(await bridge.host.addActuator("setpoint", { device: "Heating" }), Value.number(22))
  await bridge.host.actuate(await bridge.host.addActuator("temperature", { device: "Heating" }), Value.number(20.4))
  await until(() => seen(peer, "Heating").thermostat?.occupiedHeatingSetpoint === 2200, 3000, "22 °C at the controller")
  assert.deepEqual(bridge.values(command), [21.5])
  const panel = await bridge.host.panel()
  assert.ok(panel?.type === "sections" && panel.sections[2]!.panel.type === "table")
  const row = panel.sections[2]!.panel.rows.find(cells => cells[0] === "Heating")!
  assert.match(row[3]!, /^heating setpoint 21\.5 °C at /)
  assert.match(row[4]!, /^temperature 20\.4 °C at /)
})

test("a blind moving through 20 positions from Nexus costs one store write, not twenty", { timeout: 20_000 }, async () => {
  const position = await bridge.host.addActuator("position", { device: "Blind" })
  const { coalescer } = bridge.host.plugin
  // whatever earlier steps left waiting is written first
  coalescer.flush()
  const before = writes()
  for (let step = 1; step <= 20; step++) await bridge.host.actuate(position, Value.number(step * 5))
  assert.equal(writes(), before, "nothing yet")
  assert.equal(coalescer.size, 1, "one key waits")
  await until(() => coalescer.size === 0, 3000, "the coalesced write")
  assert.equal(writes() - before, 1)
})
