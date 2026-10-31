import { DescriptorServer } from "@matter/main/behaviors/descriptor"
import { DeviceEnergyManagementServer } from "@matter/main/behaviors/device-energy-management"
import { DeviceEnergyManagement } from "@matter/main/clusters/device-energy-management"

// Matter wants at least one feature; a power forecast that is never made (null) is the least
const Base = DeviceEnergyManagementServer.with("PowerForecastReporting")

/**
 * Device energy management without any control: it tells controllers what kind of energy device
 * this is and that it is online, which Matter's EVSE, heat pump and battery storage types require.
 * The endpoint is listed as a device energy management device too.
 */
export class EnergyManagementServer extends Base {
  static override readonly State = class extends Base.State {
    override esaCanGenerate = false
    override esaState = DeviceEnergyManagement.EsaState.Online
    override absMinPower = 0
    override absMaxPower = 0
    override forecast = null
  }

  override async initialize() {
    (await this.agent.load(DescriptorServer)).addDeviceTypes("DeviceEnergyManagement")
  }
}
