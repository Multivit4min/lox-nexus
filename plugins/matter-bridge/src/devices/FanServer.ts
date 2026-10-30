import { FanControlServer } from "@matter/main/behaviors/fan-control"
import { FanControl } from "@matter/main/clusters/fan-control"

const { FanMode } = FanControl

/**
 * Fan control with the speed in % and the mode (off, low, medium, high) kept in step, as Matter
 * asks: a controller may set either. Low is up to 33 %, medium up to 66 %, high above.
 */
export class FanServer extends FanControlServer {
  override initialize() {
    super.initialize()
    this.reactTo(this.events.percentSetting$Changing, this.percentChanging)
    this.reactTo(this.events.fanMode$Changing, this.modeChanging)
  }

  private percentChanging(percent: number | null) {
    if (percent !== null) this.state.fanMode = FanServer.modeFor(percent)
  }

  /** a mode that doesn't fit the speed sets the speed; one that fits (set from the speed) leaves it */
  private modeChanging(mode: FanControl.FanMode) {
    const percent = this.state.percentSetting
    if (percent !== null && FanServer.modeFor(percent) === mode) return
    const fitting = FanServer.percentFor(mode)
    if (fitting !== undefined) this.state.percentSetting = fitting
  }

  static modeFor(percent: number) {
    if (percent <= 0) return FanMode.Off
    if (percent <= 33) return FanMode.Low
    return percent <= 66 ? FanMode.Medium : FanMode.High
  }

  /** the speed a mode stands for; auto and smart keep the speed */
  static percentFor(mode: FanControl.FanMode) {
    switch (mode) {
      case FanMode.Off: return 0
      case FanMode.Low: return 33
      case FanMode.Medium: return 66
      case FanMode.High:
      case FanMode.On: return 100
      default: return undefined
    }
  }
}
