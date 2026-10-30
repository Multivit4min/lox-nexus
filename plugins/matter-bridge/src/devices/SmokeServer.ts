import { SmokeCoAlarmServer } from "@matter/main/behaviors/smoke-co-alarm"
import { SmokeCoAlarm } from "@matter/main/clusters/smoke-co-alarm"

const { AlarmState } = SmokeCoAlarm

/**
 * Smoke and CO alarm states with the Matter events controllers notify on: SmokeAlarm and COAlarm
 * when one turns critical, AllClear when both are normal again.
 */
export class SmokeServer extends SmokeCoAlarmServer.with("SmokeAlarm", "CoAlarm") {
  override initialize() {
    super.initialize()
    this.reactTo(this.events.smokeState$Changed, this.smokeChanged)
    this.reactTo(this.events.coState$Changed, this.coChanged)
  }

  private smokeChanged(state: SmokeCoAlarm.AlarmState) {
    if (state !== AlarmState.Normal) this.events.smokeAlarm.emit({ alarmSeverityLevel: state }, this.context)
    else this.allClear()
  }

  private coChanged(state: SmokeCoAlarm.AlarmState) {
    if (state !== AlarmState.Normal) this.events.coAlarm.emit({ alarmSeverityLevel: state }, this.context)
    else this.allClear()
  }

  private allClear() {
    if (this.state.smokeState === AlarmState.Normal && this.state.coState === AlarmState.Normal) this.events.allClear.emit(undefined, this.context)
  }
}
