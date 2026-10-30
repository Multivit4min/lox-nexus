import { Endpoint } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { TemperatureSensorDevice } from "@matter/main/devices/temperature-sensor"
import { BridgedDevice } from "./BridgedDevice.ts"
import type { KindValue } from "./DeviceKinds.ts"

const TemperatureEndpoint = TemperatureSensorDevice.with(BridgedDeviceBasicInformationServer)

/** A temperature sensor in °C; unknown until Nexus sends a value. */
export class BridgedTemperature extends BridgedDevice {
  readonly endpoint = new Endpoint(TemperatureEndpoint, {
    id: this.identity.endpointId,
    bridgedDeviceBasicInformation: this.identity.basicInformation(this.name),
    // what Nexus sent before the restart, else unknown
    temperatureMeasurement: { measuredValue: BridgedTemperature.hundredths(this.remembered("temperature")) }
  })

  protected async apply(_kind: string, value: KindValue) {
    await this.endpoint.set({ temperatureMeasurement: { measuredValue: BridgedTemperature.hundredths(BridgedDevice.number(value)) } })
  }

  /** °C as Matter's 1/100 °C, limited to what its int16 holds; unknown stays unknown */
  static hundredths(celsius: KindValue | undefined) {
    if (typeof celsius !== "number" || !Number.isFinite(celsius)) return null
    return BridgedDevice.clamp(Math.round(celsius * 100), -27315, 32767)
  }
}
