import { Endpoint } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { ValveConfigurationAndControl } from "@matter/main/clusters/valve-configuration-and-control"
import { WaterValveDevice } from "@matter/main/devices/water-valve"
import { BridgedDevice } from "./BridgedDevice.ts"
import type { KindValue } from "./DeviceKinds.ts"
import { ValveServer } from "./ValveServer.ts"

const ValveEndpoint = WaterValveDevice.with(BridgedDeviceBasicInformationServer, ValveServer)
const { ValveState } = ValveConfigurationAndControl

/**
 * A water valve (a main shut-off, irrigation): open and close from controllers, whether it is open
 * from Nexus. Starts with the state Nexus sent last, or unknown.
 */
export class BridgedValve extends BridgedDevice {
  readonly endpoint = new Endpoint(ValveEndpoint, {
    id: this.identity.endpointId,
    bridgedDeviceBasicInformation: this.basicInformation(),
    valveConfigurationAndControl: BridgedValve.states(this.remembered("valve"))
  })

  protected override subscribe() {
    this.listen(this.endpoint.events.valveConfigurationAndControl.requested, (open, context) => this.command("valve", open, context))
  }

  protected async apply(_kind: string, value: KindValue) {
    await this.endpoint.set({ valveConfigurationAndControl: BridgedValve.states(value) })
  }

  private static states(open: KindValue | undefined) {
    const state = open === undefined ? null : open === true ? ValveState.Open : ValveState.Closed
    return { currentState: state, targetState: state }
  }
}
