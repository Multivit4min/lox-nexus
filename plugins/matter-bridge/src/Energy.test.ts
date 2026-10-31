import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { ClientNode, Endpoint } from "@matter/main"
import { EnergyEvseClient } from "@matter/main/behaviors/energy-evse"
import { EnergyEvseModeClient } from "@matter/main/behaviors/energy-evse-mode"
import { ThermostatClient } from "@matter/main/behaviors/thermostat"
import { Thermostat } from "@matter/main/clusters/thermostat"
import { BridgeHarness } from "./test-support/BridgeHarness.ts"
import { TestController } from "./test-support/TestController.ts"

const { until, seen } = BridgeHarness
let bridge: BridgeHarness
let peer: ClientNode

before(async () => {
  bridge = await BridgeHarness.start([
    { name: "Grid", type: "electrical-meter" },
    { name: "Roof PV", type: "solar-power" },
    { name: "Home battery", type: "battery-storage" },
    { name: "Wallbox", type: "evse" },
    { name: "Heat pump", type: "heat-pump" }
  ])
  peer = await bridge.pair()
})
after(() => bridge.close())

type Events = Record<string, Record<string, { on(listener: (payload: unknown) => void): void } | undefined>>
const device = (name: string) => TestController.device(peer, name)
const actuate = async (capability: string, name: string, value: Value) => bridge.host.actuate(await bridge.host.addActuator(capability, { device: name }), value)
const deviceTypes = (endpoint: Endpoint) => ((endpoint.state as { descriptor?: { deviceTypeList?: readonly { deviceType: number }[] } }).descriptor?.deviceTypeList ?? []).map(entry => entry.deviceType)
const record = (endpoint: Endpoint, cluster: string, names: string[], payloads: unknown[] = []) => {
  const seenEvents: string[] = []
  for (const name of names) {
    (endpoint.events as unknown as Events)[cluster]?.[name]?.on(payload => {
      seenEvents.push(name)
      payloads.push(payload)
    })
  }
  return seenEvents
}
const energy = (value: unknown) => Number((value as { energy?: number | bigint } | null | undefined)?.energy)

test("electricity meter: power, energy, voltage and current in Matter's units, with the energy event", { timeout: 20_000 }, async () => {
  const payloads: unknown[] = []
  const events = record(device("Grid"), "electricalEnergyMeasurement", ["cumulativeEnergyMeasured"], payloads)
  await actuate("power", "Grid", Value.number(-1500))
  await actuate("energy-exported", "Grid", Value.number(2))
  await actuate("energy-imported", "Grid", Value.number(12.5))
  await actuate("voltage", "Grid", Value.number(230))
  await actuate("current", "Grid", Value.number(6.5))
  await until(() => seen(peer, "Grid").electricalPowerMeasurement?.activePower === -1_500_000, 3000, "-1500 W")
  await until(() => (seen(peer, "Grid").electricalEnergyMeasurement?.cumulativeEnergyImported as { energy?: number } | null)?.energy === 12_500_000, 3000, "12.5 kWh")
  await until(() => events.length === 2, 3000, "CumulativeEnergyMeasured twice")
  const last = payloads.at(-1) as { energyImported?: unknown; energyExported?: unknown }
  assert.deepEqual([energy(last.energyImported), energy(last.energyExported)], [12_500_000, 2_000_000], "each event carries both totals")
  assert.equal(seen(peer, "Grid").electricalPowerMeasurement?.voltage, 230_000)
  assert.equal(seen(peer, "Grid").electricalPowerMeasurement?.activeCurrent, 6_500)
  assert.ok(deviceTypes(device("Grid")).includes(0x514) && deviceTypes(device("Grid")).includes(0x510), "electrical meter and electrical sensor")
})

test("solar power: production is shown as power fed in, the produced energy as exported", { timeout: 20_000 }, async () => {
  await actuate("production", "Roof PV", Value.number(3200))
  await actuate("energy-exported", "Roof PV", Value.number(4.25))
  await until(() => seen(peer, "Roof PV").electricalPowerMeasurement?.activePower === -3_200_000, 3000, "3200 W produced")
  await until(() => (seen(peer, "Roof PV").electricalEnergyMeasurement?.cumulativeEnergyExported as { energy?: number } | null)?.energy === 4_250_000, 3000, "4.25 kWh")
  const types = deviceTypes(device("Roof PV"))
  assert.ok([0x17, 0x11, 0x510].every(type => types.includes(type)), `solar power, power source, electrical sensor: ${types.join(",")}`)
})

test("battery storage: state of charge and power both ways", { timeout: 20_000 }, async () => {
  await actuate("battery", "Home battery", Value.number(5))
  await actuate("power", "Home battery", Value.number(-800))
  await until(() => seen(peer, "Home battery").powerSource?.batPercentRemaining === 10, 3000, "5 %")
  await until(() => seen(peer, "Home battery").electricalPowerMeasurement?.activePower === -800_000, 3000, "discharging 800 W")
  assert.equal(seen(peer, "Home battery").powerSource?.batChargeState, 3, "not charging")
  assert.equal(seen(peer, "Home battery").powerSource?.batReplacementNeeded, false, "an empty home battery needs no replacement")
  assert.equal(seen(peer, "Home battery").powerSource?.batChargeLevel, 0)
  await actuate("power", "Home battery", Value.number(1200))
  await until(() => seen(peer, "Home battery").powerSource?.batChargeState === 1, 3000, "charging")
  assert.ok(deviceTypes(device("Home battery")).includes(0x50d), "device energy management")
})

test("wallbox: a car plugging in and charging sends Matter's session events", { timeout: 20_000 }, async () => {
  const events = record(device("Wallbox"), "energyEvse", ["evConnected", "energyTransferStarted", "energyTransferStopped", "evNotDetected"])
  await actuate("plugged-in", "Wallbox", Value.boolean(true))
  await until(() => seen(peer, "Wallbox").energyEvse?.state === 1, 3000, "plugged in, no demand")
  await actuate("charging", "Wallbox", Value.boolean(true))
  await actuate("session-energy", "Wallbox", Value.number(3.5))
  await until(() => seen(peer, "Wallbox").energyEvse?.state === 3 && seen(peer, "Wallbox").energyEvse?.sessionEnergyCharged === 3_500_000, 3000, "charging 3.5 kWh")
  await actuate("charging", "Wallbox", Value.boolean(false))
  await actuate("plugged-in", "Wallbox", Value.boolean(false))
  await until(() => events.includes("evNotDetected"), 3000, "car gone")
  assert.deepEqual(events, ["evConnected", "energyTransferStarted", "energyTransferStopped", "evNotDetected"])
  assert.equal(seen(peer, "Wallbox").energyEvse?.sessionId, 1)
})

test("wallbox: unplugging while charging stops the transfer first, whichever output Loxone sends first", { timeout: 20_000 }, async () => {
  const events = record(device("Wallbox"), "energyEvse", ["energyTransferStarted", "energyTransferStopped", "evNotDetected"])
  await actuate("charging", "Wallbox", Value.boolean(true))
  await until(() => seen(peer, "Wallbox").energyEvse?.state === 3, 3000, "charging")
  await actuate("plugged-in", "Wallbox", Value.boolean(false))
  await until(() => events.includes("evNotDetected"), 3000, "car gone")
  assert.deepEqual(events, ["energyTransferStarted", "energyTransferStopped", "evNotDetected"])
  await actuate("charging", "Wallbox", Value.boolean(false))
  assert.equal(seen(peer, "Wallbox").energyEvse?.state, 0)
})

test("wallbox: enable, disable and modes from an app are commands; states from Nexus are shown", { timeout: 20_000 }, async () => {
  const enabled = await bridge.host.addSensor("charging-enabled", { device: "Wallbox" })
  const current = await bridge.host.addSensor("max-current", { device: "Wallbox" })
  const mode = await bridge.host.addSensor("charging-mode", { device: "Wallbox" })
  const evse = device("Wallbox").commandsOf(EnergyEvseClient)
  await evse.disable()
  await until(() => bridge.last(enabled) === false, 3000, "disabled")
  await evse.enableCharging({ chargingEnabledUntil: null, minimumChargeCurrent: 6000, maximumChargeCurrent: 10_000 })
  await until(() => bridge.last(enabled) === true && bridge.last(current) === 10, 3000, "enabled at 10 A")
  // an end time that has passed: enabled, then at once disabled again
  await evse.enableCharging({ chargingEnabledUntil: 1_000_000_000, minimumChargeCurrent: 6000, maximumChargeCurrent: 10_000 })
  await until(() => bridge.last(enabled) === false, 3000, "ended at once")
  await until(() => seen(peer, "Wallbox").energyEvse?.supplyState === 0, 3000, "disabled at the controller")
  await assert.rejects(evse.enableCharging({ chargingEnabledUntil: null, minimumChargeCurrent: 20_000, maximumChargeCurrent: 10_000 }), /Constraint/)
  await evse.enableCharging({ chargingEnabledUntil: null, minimumChargeCurrent: 6000, maximumChargeCurrent: 10_000 })
  await until(() => bridge.last(enabled) === true, 3000, "enabled again")
  await device("Wallbox").commandsOf(EnergyEvseModeClient).changeToMode({ newMode: 2 })
  await until(() => bridge.last(mode) === "solar", 3000, "solar")
  await actuate("charging-mode", "Wallbox", Value.string("time-of-use"))
  await actuate("max-current", "Wallbox", Value.number(40))
  await until(() => seen(peer, "Wallbox").energyEvseMode?.currentMode === 1, 3000, "time of use")
  await until(() => seen(peer, "Wallbox").energyEvse?.maximumChargeCurrent === 32_000, 3000, "limited to the circuit's 32 A")
})

test("heat pump: its thermostat below it works both ways; power and energy are on the heat pump", { timeout: 20_000 }, async () => {
  const thermostat = device("Heat pump").parts.find(part => (part.state as { thermostat?: unknown }).thermostat !== undefined)
  assert.ok(thermostat, "a thermostat endpoint below the heat pump")
  const mode = await bridge.host.addSensor("mode", { device: "Heat pump" })
  await thermostat.setStateOf(ThermostatClient, { systemMode: Thermostat.SystemMode.Cool })
  await until(() => bridge.last(mode) === "cool", 3000, "cool")
  await actuate("temperature", "Heat pump", Value.number(21.5))
  await actuate("power", "Heat pump", Value.number(2100))
  await until(() => (thermostat.state as { thermostat?: { localTemperature?: number } }).thermostat?.localTemperature === 2150, 3000, "21.5 °C")
  await until(() => seen(peer, "Heat pump").electricalPowerMeasurement?.activePower === 2_100_000, 3000, "2100 W")
  assert.ok(deviceTypes(device("Heat pump")).includes(0x309), "heat pump")
})

test("heat pump: removing it removes its thermostat too", { timeout: 20_000 }, async () => {
  await bridge.host.action("add-device", { type: "heat-pump", name: "Garage pump" })
  const added = bridge.host.plugin.devices.named("Garage pump")!
  await until(() => { try { return TestController.device(peer, "Garage pump").parts.size > 0 } catch { return false } }, 5000, "added with its thermostat")
  const thermostat = [...added.endpoint.parts][0]!
  await bridge.host.action("remove-device", { device: added.id })
  assert.equal(thermostat.lifecycle.isReady, false, "the thermostat endpoint is gone")
  assert.equal(bridge.host.plugin.devices.get(added.id), undefined)
})

test("measurements and the wallbox's session are remembered across a restart", { timeout: 30_000 }, async () => {
  await actuate("energy-imported", "Grid", Value.number(12.5))
  await actuate("plugged-in", "Wallbox", Value.boolean(true))
  await actuate("session-energy", "Wallbox", Value.number(1))
  bridge.host.plugin.coalescer.flush()
  await bridge.restart()
  const grid = bridge.state("Grid").electricalEnergyMeasurement as { cumulativeEnergyImported?: { energy?: number } }
  assert.equal(grid.cumulativeEnergyImported?.energy, 12_500_000)
  assert.equal((bridge.state("Wallbox").energyEvse as { state?: number }).state, 1)
  // a report after the restart: the session's duration goes on, it doesn't jump to the clock's time
  await bridge.host.actuate(await bridge.host.addActuator("session-energy", { device: "Wallbox" }), Value.number(2))
  const duration = (bridge.state("Wallbox").energyEvse as { sessionDuration?: number }).sessionDuration
  assert.ok(duration !== undefined && duration < 60, `session ${duration} s`)
})
