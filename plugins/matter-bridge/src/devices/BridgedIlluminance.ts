import { Endpoint } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { LightSensorDevice } from "@matter/main/devices/light-sensor"
import { BridgedDevice } from "./BridgedDevice.ts"
import type { KindValue } from "./DeviceKinds.ts"

const LightEndpoint = LightSensorDevice.with(BridgedDeviceBasicInformationServer)

/** A light sensor in lux; unknown until Nexus sends a value. */
export class BridgedIlluminance extends BridgedDevice {
  readonly endpoint = new Endpoint(this.withBattery(LightEndpoint), {
    id: this.identity.endpointId,
    bridgedDeviceBasicInformation: this.basicInformation(),
    // what Nexus sent before the restart, else unknown
    illuminanceMeasurement: { measuredValue: BridgedIlluminance.measured(this.remembered("illuminance")) }
  })

  protected async apply(_kind: string, value: KindValue) {
    await this.endpoint.set({ illuminanceMeasurement: { measuredValue: BridgedIlluminance.measured(BridgedDevice.number(value)) } })
  }

  /** lux on Matter's logarithmic scale, 10 000 × log10(lx) + 1; below 1 lx is 0, "too dark to measure" */
  static measured(lux: KindValue | undefined) {
    if (typeof lux !== "number" || !Number.isFinite(lux)) return null
    if (lux < 1) return 0
    return BridgedDevice.clamp(Math.round(10_000 * Math.log10(lux) + 1), 1, 0xfffe)
  }
}
