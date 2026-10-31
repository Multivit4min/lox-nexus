import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { ClientNode } from "@matter/main"
import { ColorControlClient } from "@matter/main/behaviors/color-control"
import { ThermostatClient } from "@matter/main/behaviors/thermostat"
import { ValveConfigurationAndControlClient } from "@matter/main/behaviors/valve-configuration-and-control"
import { WindowCoveringClient } from "@matter/main/behaviors/window-covering"
import { Thermostat } from "@matter/main/clusters/thermostat"
import { BridgeHarness } from "./test-support/BridgeHarness.ts"
import { TestController } from "./test-support/TestController.ts"

const { until, seen } = BridgeHarness
let bridge: BridgeHarness
let peer: ClientNode

before(async () => {
  bridge = await BridgeHarness.start([
    { name: "Venetian", type: "venetian-blind" },
    { name: "Strip", type: "color-light" },
    { name: "Main valve", type: "water-valve" },
    { name: "Office air", type: "air-quality-sensor" },
    { name: "Living room", type: "thermostat-heat-cool" },
    { name: "Front", type: "doorbell" }
  ])
  peer = await bridge.pair()
})
after(() => bridge.close())

const device = (name: string) => TestController.device(peer, name)
const actuator = (capability: string, name: string) => bridge.host.addActuator(capability, { device: name })
const color = (red: number, green: number, blue: number) => ({ red, green, blue, white: 0, fadeTime: 0, flags: 0 })

test("venetian blind: slat angles from a controller are commands, a stop sends lift and slats", { timeout: 20_000 }, async () => {
  const tilt = await bridge.host.addSensor("tilt", { device: "Venetian" })
  const position = await bridge.host.addSensor("position", { device: "Venetian" })
  const commands = device("Venetian").commandsOf(WindowCoveringClient)
  await commands.goToTiltPercentage({ tiltPercent100thsValue: 5000 })
  await until(() => bridge.last(tilt) === 50, 3000, "slats at 50 %")
  await bridge.host.actuate(await actuator("tilt", "Venetian"), Value.number(20))
  await bridge.host.actuate(await actuator("position", "Venetian"), Value.number(70))
  await until(() => seen(peer, "Venetian").windowCovering?.currentPositionTiltPercent100ths === 2000, 3000, "slats at 20 % at the controller")
  await commands.stopMotion()
  await until(() => bridge.last(position) === 70 && bridge.last(tilt) === 20, 3000, "stop where it is")
})

test("colour light: a hue from a controller arrives as RGB with the brightness; RGB from Nexus is shown as hue", { timeout: 20_000 }, async () => {
  const colour = await bridge.host.addSensor("color", { device: "Strip" })
  const commands = device("Strip").commandsOf(ColorControlClient)
  await bridge.host.actuate(await actuator("brightness", "Strip"), Value.number(50))
  await commands.moveToHueAndSaturation({ hue: 0, saturation: 254, transitionTime: 0, optionsMask: {}, optionsOverride: {} })
  await until(() => JSON.stringify(bridge.last(colour)) === JSON.stringify(color(50, 0, 0)), 3000, "red at 50 %")
  await commands.moveToColor({ colorX: Math.round(0.17 * 65536), colorY: Math.round(0.7 * 65536), transitionTime: 0, optionsMask: {}, optionsOverride: {} })
  await until(() => {
    const last = bridge.last(colour) as { red: number; green: number; blue: number } | undefined
    return last !== undefined && last.green === 50 && last.red < 10
  }, 3000, "green from x/y")
  await bridge.host.actuate(await actuator("color", "Strip"), Value.rgbw(color(0, 0, 80)))
  await until(() => seen(peer, "Strip").colorControl?.currentHue === 169 && seen(peer, "Strip").levelControl?.currentLevel === 203, 3000, "blue at 80 %")
  await bridge.host.actuate(await actuator("color", "Strip"), Value.rgbw(color(0, 0, 0)))
  await until(() => seen(peer, "Strip").onOff?.onOff === false, 3000, "black is off")
})

test("water valve: open from a controller is a command and shows moving until Nexus reports", { timeout: 20_000 }, async () => {
  const request = await bridge.host.addSensor("valve", { device: "Main valve" })
  await device("Main valve").commandsOf(ValveConfigurationAndControlClient).open({})
  await until(() => bridge.last(request) === true, 3000, "open requested")
  await until(() => seen(peer, "Main valve").valveConfigurationAndControl?.currentState === 2, 3000, "transitioning")
  await bridge.host.actuate(await actuator("valve", "Main valve"), Value.boolean(true))
  await until(() => seen(peer, "Main valve").valveConfigurationAndControl?.currentState === 1, 3000, "open")
  await device("Main valve").commandsOf(ValveConfigurationAndControlClient).close()
  await until(() => bridge.last(request) === false, 3000, "close requested")
})

test("air quality: CO₂ and PM2.5 set the level until Nexus sends one of its own", { timeout: 20_000 }, async () => {
  await bridge.host.actuate(await actuator("co2", "Office air"), Value.number(1200))
  await until(() => seen(peer, "Office air").airQuality?.airQuality === 3, 3000, "moderate from CO₂")
  await bridge.host.actuate(await actuator("pm25", "Office air"), Value.number(60))
  await until(() => seen(peer, "Office air").airQuality?.airQuality === 5, 3000, "very poor from PM2.5")
  assert.equal(seen(peer, "Office air").carbonDioxideConcentrationMeasurement?.measuredValue, 1200)
  await bridge.host.actuate(await actuator("air-quality", "Office air"), Value.number(1))
  await bridge.host.actuate(await actuator("co2", "Office air"), Value.number(3000))
  await until(() => seen(peer, "Office air").carbonDioxideConcentrationMeasurement?.measuredValue === 3000, 3000, "CO₂ 3000")
  assert.equal(seen(peer, "Office air").airQuality?.airQuality, 1, "the level Nexus sent stays")
  await assert.rejects(bridge.host.actuate(await actuator("air-quality", "Office air"), Value.number(9)), /not an air quality level/)
})

test("heating and cooling thermostat: mode and both setpoints both ways", { timeout: 20_000 }, async () => {
  const mode = await bridge.host.addSensor("mode", { device: "Living room" })
  const cooling = await bridge.host.addSensor("cooling-setpoint", { device: "Living room" })
  await device("Living room").setStateOf(ThermostatClient, { systemMode: Thermostat.SystemMode.Cool })
  await until(() => bridge.last(mode) === "cool", 3000, "cool")
  await device("Living room").commandsOf(ThermostatClient).setpointRaiseLower({ mode: Thermostat.SetpointRaiseLowerMode.Cool, amount: -10 })
  await until(() => bridge.last(cooling) === 25, 3000, "26 - 1 °C")
  await bridge.host.actuate(await actuator("mode", "Living room"), Value.string("auto"))
  await bridge.host.actuate(await actuator("cooling-setpoint", "Living room"), Value.number(24))
  await until(() => seen(peer, "Living room").thermostat?.systemMode === Thermostat.SystemMode.Auto, 3000, "auto at the controller")
  await until(() => seen(peer, "Living room").thermostat?.occupiedCoolingSetpoint === 2400, 3000, "24 °C")
  await assert.rejects(bridge.host.actuate(await actuator("mode", "Living room"), Value.string("turbo")), /not a thermostat mode/)
  assert.deepEqual(bridge.values(mode), ["cool"], "states from Nexus don't come back")
})

test("doorbell: a press from Nexus rings at the controller", { timeout: 20_000 }, async () => {
  const events: string[] = []
  const switchEvents = (device("Front").events as unknown as Record<string, Record<string, { on(listener: () => void): void } | undefined>>).switch!
  for (const name of ["initialPress", "shortRelease", "longPress"]) switchEvents[name]?.on(() => events.push(name))
  await bridge.host.actuate(await actuator("press", "Front"), Value.boolean(true))
  await until(() => events.includes("shortRelease"), 3000, "a ring")
  assert.deepEqual(events, ["initialPress", "shortRelease"])
  await assert.rejects(actuator("long-press", "Front").then(id => bridge.host.actuate(id, Value.boolean(true))), /has no long press state/)
})
