import { Endpoint } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { EnergyEvse } from "@matter/main/clusters/energy-evse"
import { EnergyEvseDevice } from "@matter/main/devices/energy-evse"
import { BridgedDevice } from "../BridgedDevice.ts"
import type { KindValue, StateKind } from "../DeviceKinds.ts"
import { BridgedEnergyDevice } from "./BridgedEnergyDevice.ts"
import { ForecastEnergyManagementServer } from "./ForecastEnergyManagementServer.ts"
import { EvseModeServer } from "./EvseModeServer.ts"
import { EvseServer } from "./EvseServer.ts"
import { EnergyServers, PowerMeter, PowerServer, TopologyServer } from "./PowerMeter.ts"
import { WiredPowerServer } from "./WiredPowerServer.ts"

const EvseEndpoint = EnergyEvseDevice.with(
  BridgedDeviceBasicInformationServer, EvseServer, EvseModeServer, WiredPowerServer, TopologyServer, PowerServer, EnergyServers.imported, ForecastEnergyManagementServer
)
const { SupplyState, State } = EnergyEvse

/**
 * A wallbox (Matter 1.3's EVSE): whether a car is plugged in and charging, whether charging is
 * enabled and up to which current, the charging mode, the power and the energy of the session and
 * in total from Nexus; enable or disable charging, a maximum current and a mode from the apps.
 * Starts with what Nexus sent last, or no car and charging enabled at 16 A. After a factory reset
 * the car Nexus reported is plugged in again, which starts a new session (EVConnected).
 */
export class BridgedEvse extends BridgedEnergyDevice {
  /** the longest a timer waits */
  static readonly MAX_WAIT_MS = 2 ** 31 - 1

  protected readonly direction = "imported"

  readonly endpoint = new Endpoint(EvseEndpoint, {
    id: this.identity.endpointId,
    bridgedDeviceBasicInformation: this.basicInformation(),
    ...PowerMeter.initial("imported"),
    energyEvse: this.initialEvse()
  })

  protected override subscribe() {
    this.listen(this.endpoint.events.energyEvse.requested, (enabled, maxCurrent, until, context) => {
      this.command("chargingEnabled", enabled, context)
      if (maxCurrent !== undefined) this.command("maxCurrent", maxCurrent, context)
      if (enabled && until !== null) this.endAt(until)
    })
    this.listen(this.endpoint.events.energyEvseMode.currentMode$Changed, (mode, _old, context) => {
      if (BridgedDevice.fromController(context)) this.command("chargingMode", EvseModeServer.modeName(mode), context)
    })
  }

  protected override async applyOwn(kind: StateKind, value: KindValue) {
    const now = this.context.now()
    if (kind === "pluggedIn" || kind === "charging") {
      const vehicle = { ...this.vehicle(), [kind]: value === true }
      // a charging car is plugged in, whatever came first
      if (kind === "charging" && value === true) vehicle.pluggedIn = true
      return this.endpoint.act(agent => agent.get(EvseServer).vehicle(vehicle, now))
    }
    if (kind === "sessionEnergy") return this.endpoint.act(agent => agent.get(EvseServer).sessionEnergy(BridgedDevice.number(value), now))
    if (kind === "chargingEnabled") return this.endpoint.act(agent => agent.get(EvseServer).supply(value === true))
    if (kind === "chargingMode") return this.endpoint.setStateOf(EvseModeServer, { currentMode: EvseModeServer.mode(value) })
    if (kind !== "maxCurrent") return super.applyOwn(kind, value)
    const current = BridgedDevice.clamp(Math.round(BridgedDevice.number(value) * 1000), EvseServer.MIN_CURRENT, this.endpoint.state.energyEvse.circuitCapacity)
    await this.endpoint.setStateOf(EvseServer, { maximumChargeCurrent: current })
  }

  /**
   * An app enabled charging until a time (Unix seconds; matter.js converts Matter's epoch, which
   * counts from 2000): then charging is disabled,
   * and Nexus gets `false`, unless charging was enabled or disabled again meanwhile. A time that has
   * passed disables at once; one beyond the timer's reach (24 days) is left to the app.
   */
  private endAt(until: number) {
    const ms = until * 1000 - this.context.now()
    if (ms > BridgedEvse.MAX_WAIT_MS) return
    const expire = () => this.endpoint.act(agent => agent.get(EvseServer).expire(until))
    void this.context.wait(Math.max(0, ms))
      .then(() => this.attached ? expire() : undefined)
      .catch((error: unknown) => this.context.warn(`wallbox "${this.name}": could not end charging: ${error instanceof Error ? error.message : String(error)}`))
  }

  private vehicle() {
    const { state } = this.endpoint.state.energyEvse
    return { pluggedIn: state !== State.NotPluggedIn, charging: state === State.PluggedInCharging }
  }

  /** what Nexus sent before the restart, without events: nothing happened meanwhile that Nexus knows of */
  private initialEvse() {
    const flag = (kind: StateKind) => this.remembered(kind) === true
    const enabled = this.remembered("chargingEnabled") !== false
    const supplyState = enabled ? SupplyState.ChargingEnabled : SupplyState.Disabled
    const vehicle = { pluggedIn: flag("pluggedIn") || flag("charging"), charging: flag("charging") }
    const maxCurrent = this.remembered("maxCurrent")
    const energy = this.remembered("sessionEnergy")
    return {
      supplyState,
      state: EvseServer.stateOf(vehicle, supplyState),
      ...(typeof maxCurrent === "number" ? { maximumChargeCurrent: BridgedDevice.clamp(Math.round(maxCurrent * 1000), EvseServer.MIN_CURRENT, EvseServer.CIRCUIT) } : {}),
      ...(typeof energy === "number" && vehicle.pluggedIn ? { sessionEnergyCharged: Math.round(energy * 1_000_000) } : {})
    }
  }
}
