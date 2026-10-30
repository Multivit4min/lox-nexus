import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { ClientNode } from "@matter/main"
import { ColorControlClient } from "@matter/main/behaviors/color-control"
import { DoorLockClient } from "@matter/main/behaviors/door-lock"
import { FanControlClient } from "@matter/main/behaviors/fan-control"
import { LevelControlClient } from "@matter/main/behaviors/level-control"
import { FanControl } from "@matter/main/clusters/fan-control"
import { BridgeHarness } from "./test-support/BridgeHarness.ts"
import { TestController } from "./test-support/TestController.ts"

const { until, seen } = BridgeHarness
let bridge: BridgeHarness
let peer: ClientNode

before(async () => {
  bridge = await BridgeHarness.start([
    { name: "Ceiling", type: "color-temperature-light" },
    { name: "Fan", type: "fan" },
    { name: "Front door", type: "door-lock" },
    { name: "Alarm", type: "smoke-co-alarm" },
    { name: "Basement", type: "water-leak-detector" },
    { name: "Doorbell", type: "generic-switch" }
  ])
  peer = await bridge.pair()
})
after(() => bridge.close())

const device = (name: string) => TestController.device(peer, name)

test("tunable white light: a colour temperature from a controller arrives in Kelvin and as tunable white", { timeout: 20_000 }, async () => {
  const kelvin = await bridge.host.addSensor("color-temperature", { device: "Ceiling" })
  const white = await bridge.host.addSensor("tunable-white", { device: "Ceiling" })
  await bridge.host.actuate(await bridge.host.addActuator("brightness", { device: "Ceiling" }), Value.number(50))
  await device("Ceiling").commandsOf(ColorControlClient).moveToColorTemperature({ colorTemperatureMireds: 333, transitionTime: 0, optionsMask: {}, optionsOverride: {} })
  await until(() => bridge.last(kelvin) === 3000, 3000, "3000 K")
  await until(() => bridge.values(white).length > 0, 3000, "tunable white")
  assert.deepEqual(bridge.values(white), [{ temperature: 3000, brightness: 50, fadeTime: 0 }], "one action, one tunable white value")
  await bridge.host.actuate(await bridge.host.addActuator("tunable-white", { device: "Ceiling" }), Value.tunableWhite({ temperature: 5000, brightness: 0, fadeTime: 0 }))
  await until(() => seen(peer, "Ceiling").colorControl?.colorTemperatureMireds === 200 && seen(peer, "Ceiling").onOff?.onOff === false, 3000, "5000 K, off")
})

test("tunable white light: on at 30 % from off reports the light once, as it ends up", { timeout: 20_000 }, async () => {
  const onOff = await bridge.host.addSensor("on-off", { device: "Ceiling" })
  const brightness = await bridge.host.addSensor("brightness", { device: "Ceiling" })
  const white = await bridge.host.addSensor("tunable-white", { device: "Ceiling" })
  await device("Ceiling").commandsOf(LevelControlClient).moveToLevelWithOnOff({ level: 77, transitionTime: null, optionsMask: {}, optionsOverride: {} })
  await until(() => bridge.values(white).length > 0, 3000, "reported")
  await new Promise(resolve => setTimeout(resolve, 100))
  assert.deepEqual(bridge.values(onOff), [true])
  assert.deepEqual(bridge.values(brightness), [30])
  assert.deepEqual(bridge.values(white), [{ temperature: 5000, brightness: 30, fadeTime: 0 }])
})

test("fan: a speed or a mode from a controller is a speed command; on is a speed above 0", { timeout: 20_000 }, async () => {
  const speed = await bridge.host.addSensor("fan-speed", { device: "Fan" })
  const onOff = await bridge.host.addSensor("on-off", { device: "Fan" })
  await device("Fan").setStateOf(FanControlClient, { percentSetting: 40 })
  await until(() => bridge.last(speed) === 40 && bridge.last(onOff) === true, 3000, "40 %")
  await until(() => seen(peer, "Fan").fanControl?.fanMode === 2, 3000, "the mode follows: medium")
  await device("Fan").setStateOf(FanControlClient, { fanMode: FanControl.FanMode.High })
  await until(() => bridge.last(speed) === 100, 3000, "high is 100 %")
  await device("Fan").setStateOf(FanControlClient, { fanMode: FanControl.FanMode.Off })
  await until(() => bridge.last(speed) === 0 && bridge.last(onOff) === false, 3000, "off")
  assert.deepEqual(bridge.values(onOff), [true, false], "on/off only when it changes, not with every speed")
})

test("door lock: locking arrives; unlocking is refused with a Matter failure unless the device allows it", { timeout: 30_000 }, async () => {
  const request = await bridge.host.addSensor("lock", { device: "Front door" })
  const lock = device("Front door").commandsOf(DoorLockClient)
  await lock.lockDoor({})
  await until(() => bridge.last(request) === true, 3000, "lock requested")
  await assert.rejects(lock.unlockDoor({}), /FAILURE|Failure|failure/)
  assert.deepEqual(bridge.values(request), [true], "a refused unlock reaches nothing")
  await until(() => seen(peer, "Front door").doorLock?.lockState === 1, 3000, "locked at once, as Matter wants")

  await bridge.host.action("edit-lock", { device: "Front door", name: "Front door", allowUnlock: true })
  await lock.unlockDoor({})
  await until(() => bridge.last(request) === false, 3000, "unlock requested")
  await bridge.host.action("edit-lock", { device: "Front door", name: "Front door", allowUnlock: false })
  await assert.rejects(lock.unlockDoor({}), /FAILURE|Failure|failure/)
})

test("smoke and CO alarm: states from Nexus reach the controller with the alarm events and AllClear", { timeout: 20_000 }, async () => {
  const events: string[] = []
  const alarm = (device("Alarm").events as unknown as Record<string, Record<string, { on(listener: (payload: unknown) => void): void } | undefined>>).smokeCoAlarm!
  for (const name of ["smokeAlarm", "coAlarm", "allClear"]) alarm[name]?.on(() => events.push(name))
  const smoke = await bridge.host.addActuator("smoke", { device: "Alarm" })
  const co = await bridge.host.addActuator("co", { device: "Alarm" })
  await bridge.host.actuate(smoke, Value.boolean(true))
  await until(() => seen(peer, "Alarm").smokeCoAlarm?.smokeState === 2 && seen(peer, "Alarm").smokeCoAlarm?.expressedState === 1, 3000, "smoke alarm")
  await bridge.host.actuate(co, Value.boolean(true))
  await until(() => seen(peer, "Alarm").smokeCoAlarm?.coState === 2, 3000, "CO alarm")
  assert.equal(seen(peer, "Alarm").smokeCoAlarm?.expressedState, 1, "smoke wins the expressed state")
  await bridge.host.actuate(smoke, Value.boolean(false))
  await until(() => seen(peer, "Alarm").smokeCoAlarm?.expressedState === 2, 3000, "CO left")
  await bridge.host.actuate(co, Value.boolean(false))
  await until(() => events.includes("allClear"), 3000, "all clear")
  assert.deepEqual(events, ["smokeAlarm", "coAlarm", "allClear"])
  assert.equal(seen(peer, "Alarm").smokeCoAlarm?.expressedState, 0)
})

test("water leak: a leak from Nexus reaches the controller", { timeout: 20_000 }, async () => {
  await bridge.host.actuate(await bridge.host.addActuator("leak", { device: "Basement" }), Value.boolean(true))
  await until(() => seen(peer, "Basement").booleanState?.stateValue === true, 3000, "leak")
})

test("button: a press from Nexus is a press at the controller, a long press a long one", { timeout: 20_000 }, async () => {
  const events: string[] = []
  const switchEvents = (device("Doorbell").events as unknown as Record<string, Record<string, { on(listener: () => void): void } | undefined>>).switch!
  for (const name of ["initialPress", "shortRelease", "multiPressComplete", "longPress", "longRelease"]) switchEvents[name]?.on(() => events.push(name))
  const press = await bridge.host.addActuator("press", { device: "Doorbell" })
  await bridge.host.actuate(press, Value.boolean(true))
  await bridge.host.actuate(press, Value.boolean(false))
  await until(() => events.includes("multiPressComplete"), 3000, "a short press")
  assert.deepEqual(events, ["initialPress", "shortRelease", "multiPressComplete"])
  events.length = 0
  await bridge.host.actuate(await bridge.host.addActuator("long-press", { device: "Doorbell" }), Value.boolean(true))
  await until(() => events.includes("longRelease"), 3000, "a long press")
  assert.deepEqual(events, ["initialPress", "longPress", "longRelease"])
})
