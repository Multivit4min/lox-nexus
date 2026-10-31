import { Endpoint } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { DeviceEnergyManagement } from "@matter/main/clusters/device-energy-management"
import { EnergyEvse } from "@matter/main/clusters/energy-evse"
import { EnergyEvseDevice } from "@matter/main/devices/energy-evse"
import { BridgedDevice } from "../BridgedDevice.ts"
import type { KindValue, StateKind } from "../DeviceKinds.ts"
import { BridgedEnergyDevice } from "./BridgedEnergyDevice.ts"
import { EnergyManagementServer } from "./EnergyManagementServer.ts"
import { EvseModeServer } from "./EvseModeServer.ts"
import { EvseServer } from "./EvseServer.ts"
import { EnergyServer, PowerMeter, PowerServer, TopologyServer } from "./PowerMeter.ts"
import { WiredPowerServer } from "./WiredPowerServer.ts"

const EvseEndpoint = EnergyEvseDevice.with(
  BridgedDeviceBasicInformationServer, EvseServer, EvseModeServer, WiredPowerServer, TopologyServer, PowerServer, EnergyServer, EnergyManagementServer
)
const { SupplyState, State } = EnergyEvse

/**
 * A wallbox (Matter 1.3's EVSE): whether a car is plugged in and charging, whether charging is
 * enabled and up to which current, the charging mode, the power and the energy of the session and
 * in total from Nexus; enable or disable charging, a maximum current and a mode from the apps.
 * Starts with what Nexus sent last, or no car and charging enabled at 16 A.
 */
export class BridgedEvse extends BridgedEnergyDevice {
  readonly endpoint = new Endpoint(EvseEndpoint, {
    id: this.identity.endpointId,
    bridgedDeviceBasicInformation: this.basicInformation(),
    ...PowerMeter.initial(),
    energyEvse: this.initialEvse(),
    deviceEnergyManagement: { esaType: DeviceEnergyManagement.EsaType.Evse }
  })

  protected override subscribe() {
    this.listen(this.endpoint.events.energyEvse.requested, (enabled, maxCurrent, context) => {
      this.command("chargingEnabled", enabled, context)
      if (maxCurrent !== undefined) this.command("maxCurrent", maxCurrent, context)
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
    if (kind === "chargingEnabled") return this.endpoint.act(agent => agent.get(EvseServer).supply(value === true, this.vehicle()))
    if (kind === "chargingMode") return this.endpoint.setStateOf(EvseModeServer, { currentMode: EvseModeServer.mode(value) })
    const { minimumChargeCurrent, circuitCapacity } = this.endpoint.state.energyEvse
    const current = BridgedDevice.clamp(Math.round(BridgedDevice.number(value) * 1000), minimumChargeCurrent, circuitCapacity)
    await this.endpoint.setStateOf(EvseServer, { maximumChargeCurrent: current })
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
      ...(typeof maxCurrent === "number" ? { maximumChargeCurrent: BridgedDevice.clamp(Math.round(maxCurrent * 1000), 6_000, 32_000) } : {}),
      ...(typeof energy === "number" && vehicle.pluggedIn ? { sessionEnergyCharged: Math.round(energy * 1_000_000) } : {})
    }
  }
}
