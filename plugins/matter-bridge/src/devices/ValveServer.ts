import { Observable } from "@matter/main"
import { ValveConfigurationAndControlServer } from "@matter/main/behaviors/valve-configuration-and-control"
import { ValveConfigurationAndControl } from "@matter/main/clusters/valve-configuration-and-control"

const { ValveState } = ValveConfigurationAndControl

/**
 * A valve that moves nothing itself: open and close from a controller set the target state and go
 * to Nexus; the current state comes back from Nexus. A duration an app asks for isn't kept: the
 * valve stays open until it is closed (Loxone's own timer can close it).
 */
export class ValveServer extends ValveConfigurationAndControlServer {
  static override readonly State = class extends ValveConfigurationAndControlServer.State {
    override openDuration = null
    override defaultOpenDuration = null
    override remainingDuration = null
    override currentState: ValveConfigurationAndControl.ValveState | null = null
    override targetState: ValveConfigurationAndControl.ValveState | null = null
  }

  static override readonly Events = class extends ValveConfigurationAndControlServer.Events {
    /** a controller asked to open (true) or close (false) */
    requested = Observable<[open: boolean, context: unknown]>()
  }

  declare readonly events: InstanceType<typeof ValveServer.Events>

  override open() {
    this.request(true)
  }

  override close() {
    this.request(false)
  }

  private request(open: boolean) {
    const target = open ? ValveState.Open : ValveState.Closed
    this.state.targetState = target
    // until Nexus reports, the valve is on its way, unless it is already there
    if (this.state.currentState !== target) this.state.currentState = ValveState.Transitioning
    this.events.requested.emit(open, this.context)
  }
}
