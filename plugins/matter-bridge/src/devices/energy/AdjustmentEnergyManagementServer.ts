import { DescriptorServer } from "@matter/main/behaviors/descriptor"
import { DeviceEnergyManagementServer } from "@matter/main/behaviors/device-energy-management"
import { DeviceEnergyManagement } from "@matter/main/clusters/device-energy-management"
import { Status, StatusResponseError } from "@matter/main/types"

// battery storage's and a heat pump's energy management need power adjustment
const Base = DeviceEnergyManagementServer.with("PowerAdjustment")

/**
 * Device energy management of a home battery or heat pump, as Matter's types require, without
 * control: it has no adjustment capability (null), so a controller's power adjustment request is
 * refused, and nothing is ever adjusted. The endpoint is listed as a device energy management
 * device too. The ESA type is set per device.
 */
export class AdjustmentEnergyManagementServer extends Base {
  static override readonly State = class extends Base.State {
    override esaCanGenerate = false
    override esaState = DeviceEnergyManagement.EsaState.Online
    override absMinPower = 0
    override absMaxPower = 0
    override powerAdjustmentCapability = null
    override optOutState = DeviceEnergyManagement.OptOutState.NoOptOut
  }

  override async initialize() {
    await super.initialize()
    ;(await this.agent.load(DescriptorServer)).addDeviceTypes("DeviceEnergyManagement")
  }

  override powerAdjustRequest() {
    throw new StatusResponseError("this device takes no power adjustments through Matter", Status.ConstraintError)
  }

  override cancelPowerAdjustRequest() {
    throw new StatusResponseError("no power adjustment is running", Status.InvalidInState)
  }
}
