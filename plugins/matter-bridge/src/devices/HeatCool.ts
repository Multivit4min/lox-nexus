import type { Endpoint } from "@matter/main"
import { ThermostatServer } from "@matter/main/behaviors/thermostat"
import { Thermostat } from "@matter/main/clusters/thermostat"
import { BridgedDevice } from "./BridgedDevice.ts"
import { BridgedTemperature } from "./BridgedTemperature.ts"
import type { CommandKind, KindValue, StateKind, ThermostatMode } from "./DeviceKinds.ts"

/** a thermostat that heats and cools, and switches between them on its own in auto mode */
export const HeatCoolServer = ThermostatServer.with("Heating", "Cooling", "AutoMode")

const { SystemMode } = Thermostat
const MODES: Record<ThermostatMode, Thermostat.SystemMode> = { off: SystemMode.Off, heat: SystemMode.Heat, cool: SystemMode.Cool, auto: SystemMode.Auto }

type Listen = <T extends unknown[]>(event: { on(listener: (...args: T) => void): void; off(listener: (...args: T) => void): void }, listener: (...args: T) => void) => void
type Command = (kind: CommandKind, value: KindValue) => void

/**
 * The heating and cooling thermostat of an endpoint (a thermostat of its own, or a heat pump's):
 * the room temperature, both setpoints and the mode from Nexus, setpoint and mode changes from
 * controllers. Modes are "off", "heat", "cool" and "auto"; a mode a controller picks that Nexus
 * doesn't know (fan only, dry, …) is passed on as Matter names it.
 */
export class HeatCool {
  /** auto mode keeps the setpoints at least this far apart (°C) */
  static readonly DEAD_BAND = 2

  constructor(private readonly endpoint: Endpoint) {}

  /** the thermostat's attributes on creation; the room temperature is what Nexus sent last */
  static initial(temperature: KindValue | undefined) {
    return {
      controlSequenceOfOperation: Thermostat.ControlSequenceOfOperation.CoolingAndHeating,
      systemMode: SystemMode.Heat,
      minSetpointDeadBand: HeatCool.DEAD_BAND * 10,
      localTemperature: BridgedTemperature.hundredths(temperature)
    }
  }

  subscribe(listen: Listen, command: Command) {
    const events = this.endpoint.eventsOf(HeatCoolServer)
    listen(events.occupiedHeatingSetpoint$Changed, (setpoint: number, _old: number, context: { fabric?: unknown } | undefined) => {
      if (context?.fabric !== undefined) command("setpoint", setpoint / 100)
    })
    listen(events.occupiedCoolingSetpoint$Changed, (setpoint: number, _old: number, context: { fabric?: unknown } | undefined) => {
      if (context?.fabric !== undefined) command("coolingSetpoint", setpoint / 100)
    })
    listen(events.systemMode$Changed, (mode: Thermostat.SystemMode, _old: Thermostat.SystemMode, context: { fabric?: unknown } | undefined) => {
      if (context?.fabric !== undefined) command("mode", HeatCool.modeName(mode))
    })
  }

  async apply(kind: StateKind, value: KindValue) {
    if (kind === "temperature") return this.endpoint.setStateOf(HeatCoolServer, { localTemperature: BridgedTemperature.hundredths(BridgedDevice.number(value)) })
    if (kind === "mode") return this.endpoint.setStateOf(HeatCoolServer, { systemMode: HeatCool.mode(value) })
    const state = this.endpoint.stateOf(HeatCoolServer)
    const hundredths = Math.round(BridgedDevice.number(value) * 100)
    // Matter refuses a setpoint outside the limits; the closest allowed one is shown instead
    if (kind === "coolingSetpoint") {
      const setpoint = BridgedDevice.clamp(hundredths, state.minCoolSetpointLimit ?? 1600, state.maxCoolSetpointLimit ?? 3200)
      return this.endpoint.setStateOf(HeatCoolServer, { occupiedCoolingSetpoint: setpoint })
    }
    const setpoint = BridgedDevice.clamp(hundredths, state.minHeatSetpointLimit ?? 700, state.maxHeatSetpointLimit ?? 3000)
    await this.endpoint.setStateOf(HeatCoolServer, { occupiedHeatingSetpoint: setpoint })
  }

  static mode(value: KindValue) {
    const mode = typeof value === "string" ? MODES[value.toLowerCase() as ThermostatMode] : undefined
    if (mode === undefined) throw new Error(`not a thermostat mode: ${JSON.stringify(value)}; one of ${Object.keys(MODES).join(", ")}`)
    return mode
  }

  static modeName(mode: Thermostat.SystemMode) {
    const known = Object.entries(MODES).find(([, value]) => value === mode)?.[0]
    return known ?? (SystemMode[mode] ?? String(mode)).toLowerCase()
  }
}
