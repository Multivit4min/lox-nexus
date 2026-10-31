import { Endpoint } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { SolarPowerDevice } from "@matter/main/devices/solar-power"
import { BridgedEnergyDevice } from "./BridgedEnergyDevice.ts"
import { EnergyServers, PowerMeter, PowerServer, TopologyServer } from "./PowerMeter.ts"
import { WiredPowerServer } from "./WiredPowerServer.ts"

const SolarEndpoint = SolarPowerDevice.with(BridgedDeviceBasicInformationServer, WiredPowerServer, TopologyServer, PowerServer, EnergyServers.exported)

/**
 * A PV system (Matter 1.4's solar power, with the power source and electrical sensor it requires
 * on the same endpoint): the power it produces and the energy it has produced, as exported energy.
 */
export class BridgedSolar extends BridgedEnergyDevice {
  protected readonly direction = "exported"

  readonly endpoint = new Endpoint(SolarEndpoint, {
    id: this.identity.endpointId,
    bridgedDeviceBasicInformation: this.basicInformation(),
    ...PowerMeter.initial("exported")
  })
}
