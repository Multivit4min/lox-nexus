import { Endpoint } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { DeviceEnergyManagement } from "@matter/main/clusters/device-energy-management"
import { BatteryStorageDevice } from "@matter/main/devices/battery-storage"
import { BridgedDevice } from "../BridgedDevice.ts"
import type { KindValue, StateKind } from "../DeviceKinds.ts"
import { AdjustmentEnergyManagementServer } from "./AdjustmentEnergyManagementServer.ts"
import { BridgedEnergyDevice } from "./BridgedEnergyDevice.ts"
import { EnergyServers, PowerMeter, PowerServer, TopologyServer } from "./PowerMeter.ts"
import { StorageBatteryServer } from "./StorageBatteryServer.ts"

const StorageEndpoint = BatteryStorageDevice.with(
  BridgedDeviceBasicInformationServer, StorageBatteryServer, TopologyServer, PowerServer, EnergyServers.both, AdjustmentEnergyManagementServer
)

/**
 * A home battery (Matter 1.4's battery storage): its state of charge, the power going in (positive,
 * charging) or out (negative), and the energy charged and discharged. One endpoint carries the
 * battery, its measurements and its energy management; Matter describes the AC and battery sides
 * as two, which the apps don't need to show the values.
 */
export class BridgedBatteryStorage extends BridgedEnergyDevice {
  protected readonly direction = "both"

  readonly endpoint = new Endpoint(StorageEndpoint, {
    id: this.identity.endpointId,
    bridgedDeviceBasicInformation: this.basicInformation(),
    ...PowerMeter.initial("both"),
    deviceEnergyManagement: { esaType: DeviceEnergyManagement.EsaType.BatteryStorage, esaCanGenerate: true }
  })

  /** the measurements, then whether it charges, which follows the power's sign */
  protected override async apply(kind: StateKind, value: KindValue) {
    await super.apply(kind, value)
    if (kind === "power") await this.updateChargeState()
  }

  protected override async applyOwn(_kind: StateKind, value: KindValue) {
    await this.endpoint.setStateOf(StorageBatteryServer, StorageBatteryServer.level(BridgedDevice.number(value)))
    await this.updateChargeState()
  }

  private async updateChargeState() {
    const milliwatts = Number(this.endpoint.state.electricalPowerMeasurement.activePower ?? 0)
    const batChargeState = StorageBatteryServer.chargeState(milliwatts, this.endpoint.state.powerSource.batPercentRemaining)
    await this.endpoint.setStateOf(StorageBatteryServer, { batChargeState })
  }
}
