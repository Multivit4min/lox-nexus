import { DescriptorServer } from "@matter/main/behaviors/descriptor"
import { DeviceEnergyManagementServer } from "@matter/main/behaviors/device-energy-management"
import { DeviceEnergyManagement } from "@matter/main/clusters/device-energy-management"

// a wallbox's energy management needs power forecast reporting; a forecast that is never made (null)
const Base = DeviceEnergyManagementServer.with("PowerForecastReporting")

/**
 * A wallbox's device energy management, without any control: it tells controllers that it is an
 * EV charger and online, as Matter's EVSE type requires, and has no forecast to report. The
 * endpoint is listed as a device energy management device too.
 */
export class ForecastEnergyManagementServer extends Base {
  static override readonly State = class extends Base.State {
    override esaType = DeviceEnergyManagement.EsaType.Evse
    override esaCanGenerate = false
    override esaState = DeviceEnergyManagement.EsaState.Online
    override absMinPower = 0
    override absMaxPower = 0
    override forecast = null
  }

  override async initialize() {
    await super.initialize()
    ;(await this.agent.load(DescriptorServer)).addDeviceTypes("DeviceEnergyManagement")
  }
}
