import { Endpoint } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { OccupancySensingServer } from "@matter/main/behaviors/occupancy-sensing"
import { OccupancySensorDevice } from "@matter/main/devices/occupancy-sensor"
import { BridgedDevice } from "./BridgedDevice.ts"
import type { KindValue } from "./DeviceKinds.ts"

const OccupancyEndpoint = OccupancySensorDevice.with(BridgedDeviceBasicInformationServer, OccupancySensingServer.with("PassiveInfrared"))

/** A motion (occupancy) sensor. Starts with the state Nexus sent last, or unoccupied. */
export class BridgedOccupancy extends BridgedDevice {
  readonly endpoint = new Endpoint(this.withBattery(OccupancyEndpoint), {
    id: this.identity.endpointId,
    bridgedDeviceBasicInformation: this.basicInformation(),
    occupancySensing: { occupancy: { occupied: this.remembered("occupancy") === true } }
  })

  protected async apply(_kind: string, value: KindValue) {
    await this.endpoint.set({ occupancySensing: { occupancy: { occupied: value === true } } })
  }
}
