import { Endpoint } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { ElectricalMeterDevice } from "@matter/main/devices/electrical-meter"
import { BridgedEnergyDevice } from "./BridgedEnergyDevice.ts"
import { EnergyServer, PowerMeter, PowerServer, TopologyServer } from "./PowerMeter.ts"

const MeterEndpoint = ElectricalMeterDevice.with(BridgedDeviceBasicInformationServer, TopologyServer, PowerServer, EnergyServer)

/**
 * An electricity meter (Matter 1.5's electrical meter, also an electrical sensor): power, imported
 * and exported energy, voltage and current, e.g. from a Fronius smart meter or a Loxone meter.
 */
export class BridgedMeter extends BridgedEnergyDevice {
  readonly endpoint = new Endpoint(MeterEndpoint, {
    id: this.identity.endpointId,
    bridgedDeviceBasicInformation: this.basicInformation(),
    ...PowerMeter.initial()
  })
}
