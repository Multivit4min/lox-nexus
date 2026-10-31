import { Endpoint } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { DeviceEnergyManagement } from "@matter/main/clusters/device-energy-management"
import { BatteryStorageDevice } from "@matter/main/devices/battery-storage"
import { BatteryServer } from "../BatteryServer.ts"
import { BridgedEnergyDevice } from "./BridgedEnergyDevice.ts"
import { EnergyManagementServer } from "./EnergyManagementServer.ts"
import { EnergyServer, PowerMeter, PowerServer, TopologyServer } from "./PowerMeter.ts"

const StorageEndpoint = BatteryStorageDevice.with(
  BridgedDeviceBasicInformationServer, BatteryServer, TopologyServer, PowerServer, EnergyServer, EnergyManagementServer
)

/**
 * A home battery (Matter 1.4's battery storage): its state of charge, the power going in (positive,
 * charging) or out (negative), and the energy charged and discharged. One endpoint carries the
 * battery, its measurements and its energy management; Matter describes the AC and battery sides
 * as two, which the apps don't need to show the values.
 */
export class BridgedBatteryStorage extends BridgedEnergyDevice {
  readonly endpoint = new Endpoint(StorageEndpoint, {
    id: this.identity.endpointId,
    bridgedDeviceBasicInformation: this.basicInformation(),
    ...PowerMeter.initial(),
    deviceEnergyManagement: { esaType: DeviceEnergyManagement.EsaType.BatteryStorage, esaCanGenerate: true }
  })
}
