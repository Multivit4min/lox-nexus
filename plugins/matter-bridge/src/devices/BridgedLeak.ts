import { Endpoint } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { WaterLeakDetectorDevice } from "@matter/main/devices/water-leak-detector"
import { BridgedDevice } from "./BridgedDevice.ts"
import type { KindValue } from "./DeviceKinds.ts"

const LeakEndpoint = WaterLeakDetectorDevice.with(BridgedDeviceBasicInformationServer)

/** A water leak detector: BooleanState true while a leak is detected. Starts with the state Nexus sent last, or dry. */
export class BridgedLeak extends BridgedDevice {
  readonly endpoint = new Endpoint(LeakEndpoint, {
    id: this.identity.endpointId,
    bridgedDeviceBasicInformation: this.basicInformation(),
    booleanState: { stateValue: this.remembered("leak") === true }
  })

  protected async apply(_kind: string, value: KindValue) {
    await this.endpoint.set({ booleanState: { stateValue: value === true } })
  }
}
