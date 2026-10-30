import { Observable } from "@matter/main"
import { WindowCoveringServer } from "@matter/main/behaviors/window-covering"

const LiftServer = WindowCoveringServer.with("Lift", "PositionAwareLift")

/**
 * Window covering with a lift position. The bridge doesn't move anything itself: a command sets
 * the target position, which goes to Nexus, and the current position comes back from Nexus. A stop
 * is announced explicitly: the target already equals the position Nexus reported, so matter.js's
 * stop (target = current) changes no attribute.
 */
export class CoverServer extends LiftServer {
  static override readonly Events = class extends LiftServer.Events {
    /** a controller stopped the blind; the position it is at, in 1/100 %, and the controller's action */
    stopped = Observable<[position: number | null, context: unknown]>()
  }

  declare readonly events: InstanceType<typeof CoverServer.Events>

  // matter.js's default jumps the current position to the target; the real blind reports it
  override handleMovement() {}

  override handleStopMovement() {
    this.events.stopped.emit(this.state.currentPositionLiftPercent100ths, this.context)
    return super.handleStopMovement()
  }
}
