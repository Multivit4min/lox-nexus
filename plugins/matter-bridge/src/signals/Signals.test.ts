import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { DEVICE_TYPE_IDS } from "../devices/DeviceKinds.ts"
import { MatterBridgePlugin } from "../MatterBridgePlugin.ts"
import { FreePort } from "../test-support/FreePort.ts"
import { LoopbackMdns } from "../test-support/LoopbackMdns.ts"

// test bridges announce on loopback only, not to the LAN
LoopbackMdns.use()

/** one device of every type, named after it */
const devices = DEVICE_TYPE_IDS.map(type => ({ name: type, type }))
let host: PluginTestHost<typeof MatterBridgePlugin>

before(async () => {
  host = await PluginTestHost.start(MatterBridgePlugin, { config: { port: await FreePort.udp(), devices }, timeZone: "UTC" })
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
    "plug (Plug (on/off))": ["sensor on-off", "actuator on-off"],
    "window-covering (Window covering (lift position))": ["sensor position", "actuator position"],
    "thermostat (Thermostat (heating))": ["sensor setpoint", "actuator temperature", "actuator setpoint"],
    "temperature-sensor (Temperature sensor)": ["actuator temperature"],
    "humidity-sensor (Humidity sensor)": ["actuator humidity"],
    "contact-sensor (Contact sensor (door, window))": ["actuator contact"],
    "occupancy-sensor (Motion (occupancy) sensor)": ["actuator occupancy"]
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
    "no device \"Garage\" in the bridge's settings (Devices); add it there or pick another",
    "\"plug\" is a plug (on/off), which gets no brightness commands"
  ])
})

test("an actuator for an unknown device, or one of the wrong type, is refused with the reason", async () => {
  await assert.rejects(host.addActuator("contact", { device: "Garage" }), /no device "Garage"/)
  await assert.rejects(host.addActuator("temperature", { device: "contact-sensor" }), /"contact-sensor" is a contact sensor \(door, window\), which has no temperature state/)
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
  const rows = Object.fromEntries(table.rows.map(([name, , command, last]) => [name, `${command} | ${last?.replace(/ at \d\d:\d\d:\d\d$/, "")}`]))
  assert.equal(rows["contact-sensor"], "– | open")
  assert.equal(rows["thermostat"], "– | temperature 20.5 °C", "a thermostat names which value")
  assert.equal(rows["dimmable-light"], "– | brightness 0 %")
  assert.equal(rows["occupancy-sensor"], "– | occupied")
  assert.doesNotThrow(() => JSON.stringify(panel))
})
