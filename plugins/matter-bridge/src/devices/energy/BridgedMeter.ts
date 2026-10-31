import { Endpoint } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { ElectricalMeterDevice } from "@matter/main/devices/electrical-meter"
import { BridgedEnergyDevice } from "./BridgedEnergyDevice.ts"
import { EnergyServers, PowerMeter, PowerServer, TopologyServer } from "./PowerMeter.ts"

const MeterEndpoint = ElectricalMeterDevice.with(BridgedDeviceBasicInformationServer, TopologyServer, PowerServer, EnergyServers.both)

/**
 * An electricity meter (Matter's electrical meter, also an electrical sensor): power, imported
 * and exported energy, voltage and current, e.g. from a Fronius smart meter or a Loxone meter.
 */
export class BridgedMeter extends BridgedEnergyDevice {
  protected readonly direction = "both"

  readonly endpoint = new Endpoint(MeterEndpoint, {
    id: this.identity.endpointId,
    bridgedDeviceBasicInformation: this.basicInformation(),
    ...PowerMeter.initial("both")
  })
}
