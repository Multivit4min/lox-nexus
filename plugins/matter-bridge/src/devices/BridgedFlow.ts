import { Endpoint } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { FlowSensorDevice } from "@matter/main/devices/flow-sensor"
import { BridgedDevice } from "./BridgedDevice.ts"
import type { KindValue } from "./DeviceKinds.ts"

const FlowEndpoint = FlowSensorDevice.with(BridgedDeviceBasicInformationServer)

/** A flow sensor (water, air) in m³/h; unknown until Nexus sends a value. */
export class BridgedFlow extends BridgedDevice {
  readonly endpoint = new Endpoint(this.withBattery(FlowEndpoint), {
    id: this.identity.endpointId,
    bridgedDeviceBasicInformation: this.basicInformation(),
    // what Nexus sent before the restart, else unknown
    flowMeasurement: { measuredValue: BridgedFlow.measured(this.remembered("flow")) }
  })

  protected async apply(_kind: string, value: KindValue) {
    await this.endpoint.set({ flowMeasurement: { measuredValue: BridgedFlow.measured(BridgedDevice.number(value)) } })
  }

  /** m³/h as Matter's 0.1 m³/h, limited to 0 and its uint16 */
  static measured(flow: KindValue | undefined) {
    if (typeof flow !== "number" || !Number.isFinite(flow)) return null
    return BridgedDevice.clamp(Math.round(flow * 10), 0, 0xfffe)
  }
}
