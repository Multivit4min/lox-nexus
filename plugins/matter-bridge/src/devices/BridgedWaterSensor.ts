import { Endpoint } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { RainSensorDevice } from "@matter/main/devices/rain-sensor"
import { WaterFreezeDetectorDevice } from "@matter/main/devices/water-freeze-detector"
import { WaterLeakDetectorDevice } from "@matter/main/devices/water-leak-detector"
import { BridgedDevice } from "./BridgedDevice.ts"
import type { KindValue } from "./DeviceKinds.ts"

const LeakEndpoint = WaterLeakDetectorDevice.with(BridgedDeviceBasicInformationServer)
const RainEndpoint = RainSensorDevice.with(BridgedDeviceBasicInformationServer)
const FreezeEndpoint = WaterFreezeDetectorDevice.with(BridgedDeviceBasicInformationServer)

/**
 * A water leak detector, rain sensor or water freeze detector: BooleanState true while the leak,
 * the rain or the frost is detected (matter.js sends the StateChange event with it). Starts with
 * the state Nexus sent last, or none detected.
 */
export class BridgedWaterSensor extends BridgedDevice {
  readonly endpoint = this.create()

  protected async apply(_kind: string, value: KindValue) {
    await this.endpoint.set({ booleanState: { stateValue: value === true } })
  }

  private create() {
    const kind = this.info.states[0] ?? "leak"
    const options = {
      id: this.identity.endpointId,
      bridgedDeviceBasicInformation: this.basicInformation(),
      booleanState: { stateValue: this.remembered(kind) === true }
    }
    if (this.type === "rain-sensor") return new Endpoint(this.withBattery(RainEndpoint), options)
    if (this.type === "water-freeze-detector") return new Endpoint(this.withBattery(FreezeEndpoint), options)
    return new Endpoint(this.withBattery(LeakEndpoint), options)
  }
}
