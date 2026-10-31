import { Endpoint } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { WindowCovering } from "@matter/main/clusters/window-covering"
import { WindowCoveringDevice } from "@matter/main/devices/window-covering"
import { BlindServer } from "./BlindServer.ts"
import { BridgedDevice } from "./BridgedDevice.ts"
import type { KindValue, StateKind } from "./DeviceKinds.ts"

const BlindEndpoint = WindowCoveringDevice.with(BridgedDeviceBasicInformationServer, BlindServer)

/**
 * A venetian blind: a lift position and a slat angle, both in % closed as Matter counts them (0
 * open, 100 closed; slats at 0 % are horizontal). Works as BridgedCover does for each of them;
 * a stop sends both positions it is at.
 */
export class BridgedBlind extends BridgedDevice {
  readonly endpoint = new Endpoint(BlindEndpoint, {
    id: this.identity.endpointId,
    bridgedDeviceBasicInformation: this.basicInformation(),
    // Loxone blinds with slats are mostly exterior (Raffstore)
    windowCovering: { type: WindowCovering.WindowCoveringType.TiltBlindLift, endProductType: WindowCovering.EndProductType.ExteriorVenetianBlind }
  })

  protected override subscribe() {
    const events = this.endpoint.events.windowCovering
    this.listen(events.targetPositionLiftPercent100ths$Changed, (target, _old, context) => {
      if (target !== null && BridgedDevice.fromController(context)) this.command("position", target / 100, context)
    })
    this.listen(events.targetPositionTiltPercent100ths$Changed, (target, _old, context) => {
      if (target !== null && BridgedDevice.fromController(context)) this.command("tilt", target / 100, context)
    })
    // stop: stay where it is now; nothing to send for a position that is unknown
    this.listen(events.stopped, (lift, tilt, context) => {
      if (lift !== null) this.command("position", lift / 100, context)
      if (tilt !== null) this.command("tilt", tilt / 100, context)
    })
  }

  /** the blind is where Nexus says; the target follows, so controllers don't show it moving forever */
  protected async apply(kind: StateKind, value: KindValue) {
    const position = Math.round(BridgedDevice.clamp(BridgedDevice.number(value), 0, 100) * 100)
    if (kind === "tilt") return this.endpoint.set({ windowCovering: { currentPositionTiltPercent100ths: position, targetPositionTiltPercent100ths: position } })
    await this.endpoint.set({ windowCovering: { currentPositionLiftPercent100ths: position, targetPositionLiftPercent100ths: position } })
  }
}
