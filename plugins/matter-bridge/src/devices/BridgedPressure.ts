import { Endpoint } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { PressureSensorDevice } from "@matter/main/devices/pressure-sensor"
import { BridgedDevice } from "./BridgedDevice.ts"
import type { KindValue } from "./DeviceKinds.ts"

const PressureEndpoint = PressureSensorDevice.with(BridgedDeviceBasicInformationServer)

/** An air or water pressure sensor in hPa; unknown until Nexus sends a value. */
export class BridgedPressure extends BridgedDevice {
  readonly endpoint = new Endpoint(this.withBattery(PressureEndpoint), {
    id: this.identity.endpointId,
    bridgedDeviceBasicInformation: this.basicInformation(),
    // what Nexus sent before the restart, else unknown
    pressureMeasurement: { measuredValue: BridgedPressure.measured(this.remembered("pressure")) }
  })

  protected async apply(_kind: string, value: KindValue) {
    await this.endpoint.set({ pressureMeasurement: { measuredValue: BridgedPressure.measured(BridgedDevice.number(value)) } })
  }

  /** hPa as Matter's 0.1 kPa, which is the same number, limited to its int16 */
  static measured(hpa: KindValue | undefined) {
    if (typeof hpa !== "number" || !Number.isFinite(hpa)) return null
    return BridgedDevice.clamp(Math.round(hpa), -32767, 32767)
  }
}
