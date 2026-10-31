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
 * from Nexus. Starts with the state Nexus sent last, or unknown. A request Nexus doesn't answer
 * within a minute (Loxone ignored it, the state didn't change) shows the last state again, so the
 * valve doesn't stay "moving".
 */
export class BridgedValve extends BridgedDevice {
  static readonly ANSWER_MS = 60_000

  readonly endpoint = new Endpoint(ValveEndpoint, {
    id: this.identity.endpointId,
    bridgedDeviceBasicInformation: this.basicInformation(),
    valveConfigurationAndControl: BridgedValve.states(this.remembered("valve"))
  })

  protected override subscribe() {
    this.listen(this.endpoint.events.valveConfigurationAndControl.requested, (open, context) => {
      this.command("valve", open, context)
      this.context.wait(BridgedValve.ANSWER_MS)
        .then(() => this.unanswered())
        .catch((error: unknown) => this.context.warn(`valve "${this.name}": ${error instanceof Error ? error.message : String(error)}`))
    })
  }

  private async unanswered() {
    if (!this.attached || this.endpoint.state.valveConfigurationAndControl.currentState !== ValveState.Transitioning) return
    await this.endpoint.set({ valveConfigurationAndControl: BridgedValve.states(this.remembered("valve")) })
  }

  protected async apply(_kind: string, value: KindValue) {
    await this.endpoint.set({ valveConfigurationAndControl: BridgedValve.states(value) })
  }

  /** where the valve is; no target, as it isn't moving */
  private static states(open: KindValue | undefined) {
    return { currentState: open === undefined ? null : open === true ? ValveState.Open : ValveState.Closed, targetState: null }
  }
}
