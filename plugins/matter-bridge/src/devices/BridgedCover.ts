import { Endpoint } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { WindowCoveringDevice } from "@matter/main/devices/window-covering"
import { BridgedDevice } from "./BridgedDevice.ts"
import { CoverServer } from "./CoverServer.ts"
import type { KindValue } from "./DeviceKinds.ts"

const CoverEndpoint = WindowCoveringDevice.with(BridgedDeviceBasicInformationServer, CoverServer)

/**
 * A blind or shutter. Positions in % closed, as Matter and Loxone count them: 0 is open, 100
 * closed. Open, close and stop from a controller become a target position (stop: where it is now).
 */
export class BridgedCover extends BridgedDevice {
  readonly endpoint = new Endpoint(CoverEndpoint, {
    id: this.identity.endpointId,
    bridgedDeviceBasicInformation: this.identity.basicInformation(this.name)
  })

  protected override subscribe() {
    const events = this.endpoint.events.windowCovering
    this.listen(events.targetPositionLiftPercent100ths$Changed, (target, _old, context) => {
      if (target !== null && BridgedDevice.fromController(context)) this.command("position", target / 100, context)
    })
    // stop: go to (stay at) where it is now; nothing to send while the position is unknown
    this.listen(events.stopped, (position, context) => {
      if (position !== null) this.command("position", position / 100, context)
    })
  }

  /** the blind is where Nexus says; the target follows, so controllers don't show it moving forever */
  protected async apply(_kind: string, value: KindValue) {
    const position = Math.round(BridgedDevice.clamp(BridgedDevice.number(value), 0, 100) * 100)
    await this.endpoint.set({ windowCovering: { currentPositionLiftPercent100ths: position, targetPositionLiftPercent100ths: position } })
  }
}
