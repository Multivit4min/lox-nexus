import { Endpoint } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { HumiditySensorDevice } from "@matter/main/devices/humidity-sensor"
import { BridgedDevice } from "./BridgedDevice.ts"
import type { KindValue } from "./DeviceKinds.ts"

const HumidityEndpoint = HumiditySensorDevice.with(BridgedDeviceBasicInformationServer)

/** A relative humidity sensor in %; unknown until Nexus sends a value. */
export class BridgedHumidity extends BridgedDevice {
  readonly endpoint = new Endpoint(this.withBattery(HumidityEndpoint), {
    id: this.identity.endpointId,
    bridgedDeviceBasicInformation: this.basicInformation(),
    // what Nexus sent before the restart, else unknown
    relativeHumidityMeasurement: { measuredValue: BridgedHumidity.hundredths(this.remembered("humidity")) }
  })

  protected async apply(_kind: string, value: KindValue) {
    await this.endpoint.set({ relativeHumidityMeasurement: { measuredValue: BridgedHumidity.hundredths(BridgedDevice.number(value)) } })
  }

  /** % as Matter's 1/100 %, limited to 0–100; unknown stays unknown */
  static hundredths(percent: KindValue | undefined) {
    if (typeof percent !== "number" || !Number.isFinite(percent)) return null
    return BridgedDevice.clamp(Math.round(percent * 100), 0, 10000)
  }
}
