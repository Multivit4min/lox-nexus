import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { cellText, PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { DEVICE_TYPE_IDS } from "../devices/DeviceKinds.ts"
import { MatterBridgePlugin } from "../MatterBridgePlugin.ts"
import { BridgeHarness } from "../test-support/BridgeHarness.ts"
import { FreePort } from "../test-support/FreePort.ts"
import { LoopbackMdns } from "../test-support/LoopbackMdns.ts"

// test bridges announce on loopback only, not to the LAN
LoopbackMdns.use()

/** one device of every type, named after it */
const devices = DEVICE_TYPE_IDS.map(type => ({ name: type, type }))
let host: PluginTestHost<typeof MatterBridgePlugin>

before(async () => {
  host = await PluginTestHost.start(MatterBridgePlugin, { config: { port: await FreePort.udp() }, store: BridgeHarness.store(devices), timeZone: "UTC" })
})
after(() => host.stop())

const state = (name: string) => host.plugin.devices.get(name)!.endpoint.state as Record<string, Record<string, unknown>>
const signalErrors = () => host.sent.flatMap(message => message.type === "signal.error" ? [message.error] : [])

test("the catalog offers, per device, the commands and states its type has", async () => {
  const catalog = await host.catalog()
  const offered = Object.fromEntries(catalog.map(node => [node.label, (node.entries ?? []).map(entry => `${entry.kind} ${entry.capability}`)]))
  assert.deepEqual(offered, {
    "on-off-light (On/off light)": ["sensor on-off", "actuator on-off"],
    "dimmable-light (Dimmable light)": ["sensor on-off", "sensor brightness", "actuator on-off", "actuator brightness"],
    "color-temperature-light (Tunable white light)": [
      "sensor on-off", "sensor brightness", "sensor color-temperature", "sensor tunable-white",
      "actuator on-off", "actuator brightness", "actuator color-temperature", "actuator tunable-white"
    ],
    "plug (Plug (on/off))": ["sensor on-off", "actuator on-off"],
    "window-covering (Window covering (lift position))": ["sensor position", "actuator position"],
    "thermostat (Thermostat (heating))": ["sensor setpoint", "actuator temperature", "actuator setpoint"],
    "fan (Fan)": ["sensor on-off", "sensor fan-speed", "actuator on-off", "actuator fan-speed"],
    "door-lock (Door lock)": ["sensor lock", "actuator locked"],
    "temperature-sensor (Temperature sensor)": ["actuator temperature"],
    "humidity-sensor (Humidity sensor)": ["actuator humidity"],
    "contact-sensor (Contact sensor (door, window))": ["actuator contact"],
    "occupancy-sensor (Motion (occupancy) sensor)": ["actuator occupancy"],
    "smoke-co-alarm (Smoke and CO alarm)": ["actuator smoke", "actuator co"],
    "water-leak-detector (Water leak detector)": ["actuator leak"],
    "generic-switch (Button (generic switch))": ["actuator press", "actuator long-press"],
    "light-sensor (Light sensor (lux))": ["actuator illuminance"],
    "pressure-sensor (Pressure sensor)": ["actuator pressure"],
    "flow-sensor (Flow sensor)": ["actuator flow"],
    "rain-sensor (Rain sensor)": ["actuator rain"],
    "water-freeze-detector (Water freeze detector)": ["actuator freeze"],
    "dimmable-plug (Dimmable plug)": ["sensor on-off", "sensor brightness", "actuator on-off", "actuator brightness"],
    "wall-switch (Wall switch (on/off))": ["sensor on-off", "actuator on-off"],
    "wall-dimmer (Wall dimmer)": ["sensor on-off", "sensor brightness", "actuator on-off", "actuator brightness"],
    "color-light (Colour light (RGB))": [
      "sensor on-off", "sensor brightness", "sensor color-temperature", "sensor color",
      "actuator on-off", "actuator brightness", "actuator color-temperature", "actuator color"
    ],
    "venetian-blind (Blind with slats (lift and tilt))": ["sensor position", "sensor tilt", "actuator position", "actuator tilt"],
    "thermostat-heat-cool (Thermostat (heating and cooling))": [
      "sensor setpoint", "sensor cooling-setpoint", "sensor mode", "actuator temperature", "actuator setpoint", "actuator cooling-setpoint", "actuator mode"
    ],
    "water-valve (Water valve)": ["sensor valve", "actuator valve"],
    "air-quality-sensor (Air quality sensor)": ["actuator air-quality", "actuator co2", "actuator pm25"],
    "doorbell (Doorbell)": ["actuator press"],
    "electrical-meter (Electricity meter)": [
      "actuator power", "actuator energy-imported", "actuator energy-exported", "actuator voltage", "actuator current"
    ],
    "solar-power (Solar power (PV))": ["actuator production", "actuator energy-exported"],
    "battery-storage (Battery storage)": ["actuator power", "actuator battery", "actuator energy-imported", "actuator energy-exported"],
    "evse (Wallbox (EV charger))": [
      "sensor charging-enabled", "sensor max-current", "sensor charging-mode",
      "actuator plugged-in", "actuator charging", "actuator charging-enabled", "actuator max-current", "actuator charging-mode",
      "actuator power", "actuator energy-imported", "actuator session-energy"
    ],
    "chime (Chime (bell))": ["sensor ring", "sensor chime-sound", "sensor chime-enabled", "actuator chime-enabled"],
    "heat-pump (Heat pump)": [
      "sensor setpoint", "sensor cooling-setpoint", "sensor mode",
      "actuator temperature", "actuator setpoint", "actuator cooling-setpoint", "actuator mode", "actuator power", "actuator energy-imported"
    ]
  })
  const light = catalog[0]!.entries![0]!
  assert.deepEqual(light, { kind: "sensor", capability: "on-off", params: { device: "on-off-light" }, label: "on-off-light: on/off from controllers" })
})

test("every catalog entry can be added", async () => {
  for (const node of await host.catalog()) {
    for (const entry of node.entries ?? []) {
      const id = entry.kind === "sensor" ? await host.addSensor(entry.capability, entry.params) : await host.addActuator(entry.capability, entry.params)
      await host.remove(id)
    }
  }
  assert.deepEqual(signalErrors(), [])
})

test("a sensor for an unknown device, or one of the wrong type, fails with the reason", async () => {
  await host.addSensor("on-off", { device: "Garage" })
  await host.addSensor("brightness", { device: "plug" })
  assert.deepEqual(signalErrors(), [
    "the bridge has no device \"Garage\" (any more); add it with Add device, or pick another",
    "\"plug\" is a plug (on/off), which gets no brightness commands"
  ])
})

test("an actuator for an unknown device, or one of the wrong type, fails with the reason, and so does each command", async () => {
  const before = signalErrors().length
  const garage = await host.addActuator("contact", { device: "Garage" })
  await host.addActuator("temperature", { device: "contact-sensor" })
  assert.deepEqual(signalErrors().slice(before), [
    "the bridge has no device \"Garage\" (any more); add it with Add device, or pick another",
    "\"contact-sensor\" is a contact sensor (door, window), which has no temperature state"
  ])
  await assert.rejects(host.actuate(garage, Value.boolean(true)), /the bridge has no device "Garage"/)
})

test("an actuator whose device is removed while it runs fails the signal at once", async () => {
  await host.action("add-device", { name: "Shed", type: "contact-sensor" })
  const id = host.plugin.devices.named("Shed")!.id
  const shed = await host.addActuator("contact", { device: id })
  await host.actuate(shed, Value.boolean(true))
  await host.action("remove-device", { device: id })
  assert.ok(host.sent.some(message => message.type === "signal.error" && message.signalId === shed && /no device/.test(message.error)))
  await host.remove(shed)
})

test("states from Nexus set the Matter attributes, converted and limited", async () => {
  const set = async (capability: string, device: string, value: Value) => host.actuate(await host.addActuator(capability, { device }), value)
  await set("contact", "contact-sensor", Value.boolean(true))
  assert.equal(state("contact-sensor").booleanState!.stateValue, false, "open is BooleanState false")
  await set("occupancy", "occupancy-sensor", Value.boolean(true))
  assert.equal((state("occupancy-sensor").occupancySensing!.occupancy as { occupied: boolean }).occupied, true)
  await set("temperature", "temperature-sensor", Value.number(-4.25))
  assert.equal(state("temperature-sensor").temperatureMeasurement!.measuredValue, -425)
  await set("humidity", "humidity-sensor", Value.number(120))
  assert.equal(state("humidity-sensor").relativeHumidityMeasurement!.measuredValue, 10000)
  assert.equal(state("thermostat").thermostat!.occupiedHeatingSetpoint, 2000, "Matter's default, 20 °C")
  assert.equal(state("thermostat").thermostat!.localTemperature, null)
  assert.equal(state("window-covering").windowCovering!.currentPositionLiftPercent100ths, null)
  await set("setpoint", "thermostat", Value.number(45))
  assert.equal(state("thermostat").thermostat!.occupiedHeatingSetpoint, 3000, "limited to 30 °C")
  await set("temperature", "thermostat", Value.number(20.5))
  assert.equal(state("thermostat").thermostat!.localTemperature, 2050)
  await set("position", "window-covering", Value.number(30))
  assert.equal(state("window-covering").windowCovering!.currentPositionLiftPercent100ths, 3000)
  assert.equal(state("window-covering").windowCovering!.targetPositionLiftPercent100ths, 3000)
  await set("brightness", "dimmable-light", Value.number(40))
  assert.equal(state("dimmable-light").onOff!.onOff, true)
  assert.equal(state("dimmable-light").levelControl!.currentLevel, 102)
  await set("brightness", "dimmable-light", Value.number(0))
  assert.equal(state("dimmable-light").onOff!.onOff, false, "0 % is off")
  await set("on-off", "plug", Value.boolean(true))
  assert.equal(state("plug").onOff!.onOff, true)
  await set("tunable-white", "color-temperature-light", Value.tunableWhite({ temperature: 3000, brightness: 40, fadeTime: 0 }))
  assert.equal(state("color-temperature-light").colorControl!.colorTemperatureMireds, 333)
  assert.equal(state("color-temperature-light").levelControl!.currentLevel, 102)
  assert.equal(state("color-temperature-light").onOff!.onOff, true)
  await set("color-temperature", "color-temperature-light", Value.number(9000))
  assert.equal(state("color-temperature-light").colorControl!.colorTemperatureMireds, 154, "limited to 6500 K")
  await set("tunable-white", "color-temperature-light", Value.tunableWhite({ temperature: 3000, brightness: 40, fadeTime: 0 }))
  await set("fan-speed", "fan", Value.number(50))
  assert.deepEqual([state("fan").fanControl!.percentCurrent, state("fan").fanControl!.fanMode], [50, 2], "50 % is medium")
  await set("on-off", "fan", Value.boolean(false))
  assert.deepEqual([state("fan").fanControl!.percentCurrent, state("fan").fanControl!.fanMode], [0, 0])
  await set("on-off", "fan", Value.boolean(true))
  assert.equal(state("fan").fanControl!.percentCurrent, 50, "on goes back to the last speed")
  assert.equal(state("door-lock").doorLock!.lockState, null, "a lock is unknown until Nexus says")
  await set("locked", "door-lock", Value.boolean(true))
  assert.equal(state("door-lock").doorLock!.lockState, 1)
  await set("co", "smoke-co-alarm", Value.boolean(true))
  assert.deepEqual([state("smoke-co-alarm").smokeCoAlarm!.coState, state("smoke-co-alarm").smokeCoAlarm!.expressedState], [2, 2])
  await set("leak", "water-leak-detector", Value.boolean(true))
  assert.equal(state("water-leak-detector").booleanState!.stateValue, true, "leak is BooleanState true")
})

test("states from Nexus don't come back as commands", async () => {
  const command = await host.addSensor("on-off", { device: "on-off-light" })
  await host.actuate(await host.addActuator("on-off", { device: "on-off-light" }), Value.boolean(true))
  assert.equal(state("on-off-light").onOff!.onOff, true)
  assert.deepEqual(host.values(command), [])
})

test("the panel shows each device with its last state; nothing in it is a BigInt", async () => {
  const panel = await host.panel()
  assert.ok(panel?.type === "sections")
  assert.deepEqual(panel.sections.map(section => section.title), ["Pairing", "Controllers", "Devices"])
  const table = panel.sections[2]!.panel
  assert.ok(table.type === "table")
  assert.deepEqual(table.columns, ["Device", "Id", "Type", "Last command from a controller", "Last state from Nexus"])
  const rows = Object.fromEntries(table.rows.map(row => row.map(cellText)).map(([name, , , command, last]) => [name, `${command} | ${last?.replace(/ at \d\d:\d\d:\d\d$/, "")}`]))
  assert.equal(rows["contact-sensor"], "– | open")
  assert.equal(rows["thermostat"], "– | temperature 20.5 °C", "a thermostat names which value")
  assert.equal(rows["dimmable-light"], "– | brightness 0 %")
  assert.equal(rows["occupancy-sensor"], "– | occupied")
  assert.equal(rows["color-temperature-light"], "– | tunable white 3000 K, 40 %")
  assert.equal(rows["door-lock"], "– | locked")
  assert.equal(rows["smoke-co-alarm"], "– | CO alarm")
  // each row edits or removes its device, prefilled with what the edit form needs; a lock's form has Allow unlocking
  assert.deepEqual(table.rowActions?.[table.rows.findIndex(row => row[0] === "door-lock")], [
    { action: "edit-lock", label: "Edit", input: { device: "door-lock", name: "door-lock", allowUnlock: false } },
    { action: "remove-device", label: "Remove", input: { device: "door-lock" } }
  ])
  assert.deepEqual(table.rowActions?.[table.rows.findIndex(row => row[0] === "plug")]?.[0], { action: "edit-device", label: "Edit", input: { device: "plug", name: "plug" } })
  assert.deepEqual(panel.sections.map(section => [section.title, section.actions?.map(button => button.action)]), [
    ["Pairing", ["open-pairing-window"]], ["Controllers", undefined], ["Devices", ["add-device"]]
  ])
  assert.doesNotThrow(() => JSON.stringify(panel))
})
