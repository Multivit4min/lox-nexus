import { Endpoint } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { DeviceEnergyManagement } from "@matter/main/clusters/device-energy-management"
import { HeatPumpDevice } from "@matter/main/devices/heat-pump"
import { ThermostatDevice } from "@matter/main/devices/thermostat"
import type { KindValue, StateKind } from "../DeviceKinds.ts"
import { HeatCool } from "../HeatCool.ts"
import { HeatCoolServer } from "../HeatCoolServer.ts"
import { BridgedEnergyDevice } from "./BridgedEnergyDevice.ts"
import { AdjustmentEnergyManagementServer } from "./AdjustmentEnergyManagementServer.ts"
import { EnergyServers, PowerMeter, PowerServer, TopologyServer } from "./PowerMeter.ts"
import { WiredPowerServer } from "./WiredPowerServer.ts"

const HeatPumpEndpoint = HeatPumpDevice.with(
  BridgedDeviceBasicInformationServer, WiredPowerServer, TopologyServer, PowerServer, EnergyServers.imported, AdjustmentEnergyManagementServer
)
const ThermostatEndpoint = ThermostatDevice.with(HeatCoolServer)

/**
 * A heat pump (Matter 1.4): the heat pump endpoint carries its power source, electrical
 * measurements (power, energy used) and energy management; a thermostat endpoint below it has the
 * room temperature, heating and cooling setpoints and the mode, as the heating and cooling
 * thermostat does.
 */
export class BridgedHeatPump extends BridgedEnergyDevice {
  private readonly thermostatEndpoint = new Endpoint(ThermostatEndpoint, {
    id: `${this.identity.endpointId}-thermostat`,
    thermostat: HeatCool.initial(this.remembered("temperature"))
  })

  protected readonly direction = "imported"

  readonly endpoint = new Endpoint(HeatPumpEndpoint, {
    id: this.identity.endpointId,
    bridgedDeviceBasicInformation: this.basicInformation(),
    ...PowerMeter.initial("imported"),
    deviceEnergyManagement: { esaType: DeviceEnergyManagement.EsaType.SpaceHeatingCooling },
    parts: [this.thermostatEndpoint]
  })

  private readonly thermostat = new HeatCool(this.thermostatEndpoint)

  protected override subscribe() {
    this.thermostat.subscribe((event, listener) => this.listen(event, listener), (kind, value) => this.command(kind, value))
  }

  protected override async applyOwn(kind: StateKind, value: KindValue) {
    await this.thermostat.apply(kind, value)
  }
}
