import { Observable } from "@matter/main"
import { WindowCoveringServer } from "@matter/main/behaviors/window-covering"

const LiftAndTiltServer = WindowCoveringServer.with("Lift", "PositionAwareLift", "Tilt", "PositionAwareTilt")

/**
 * Window covering with a lift position and slats that tilt (a venetian blind), working as
 * CoverServer does: commands set the target positions, which go to Nexus, and the current
 * positions come back from Nexus. A stop announces both positions it is at.
 */
export class BlindServer extends LiftAndTiltServer {
  static override readonly Events = class extends LiftAndTiltServer.Events {
    /** a controller stopped the blind; where it is, in 1/100 %, and the controller's action */
    stopped = Observable<[lift: number | null, tilt: number | null, context: unknown]>()
  }

  declare readonly events: InstanceType<typeof BlindServer.Events>

  // matter.js's default jumps the current position to the target; the real blind reports it
  override handleMovement() {}

  override handleStopMovement() {
    this.events.stopped.emit(this.state.currentPositionLiftPercent100ths, this.state.currentPositionTiltPercent100ths, this.context)
    return super.handleStopMovement()
  }
}
