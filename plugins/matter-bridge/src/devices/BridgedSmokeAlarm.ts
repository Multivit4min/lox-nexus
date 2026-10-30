import { Endpoint } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { PowerSourceServer } from "@matter/main/behaviors/power-source"
import { PowerSource } from "@matter/main/clusters/power-source"
import { SmokeCoAlarm } from "@matter/main/clusters/smoke-co-alarm"
import { SmokeCoAlarmDevice } from "@matter/main/devices/smoke-co-alarm"
import { BridgedDevice } from "./BridgedDevice.ts"
import type { KindValue, StateKind } from "./DeviceKinds.ts"
import { SmokeServer } from "./SmokeServer.ts"

// Matter's smoke alarm device type requires a power source; the bridge reports it as wired
const SmokeEndpoint = SmokeCoAlarmDevice.with(BridgedDeviceBasicInformationServer, SmokeServer, PowerSourceServer.with("Wired"))
const { AlarmState, ExpressedState } = SmokeCoAlarm

/**
 * Forwards an alarm state from Nexus (for example a Loxone fire and water alarm) as a Matter smoke
 * and CO alarm, so the apps notify. It is not a smoke detector: it alarms only when Nexus says so.
 * Starts with the states Nexus sent last, or normal.
 */
export class BridgedSmokeAlarm extends BridgedDevice {
  readonly endpoint = new Endpoint(SmokeEndpoint, {
    id: this.identity.endpointId,
    bridgedDeviceBasicInformation: this.basicInformation(),
    smokeCoAlarm: BridgedSmokeAlarm.states(this.remembered("smoke") === true, this.remembered("co") === true),
    powerSource: { status: PowerSource.PowerSourceStatus.Active, order: 0, description: "Lox Nexus", wiredCurrentType: PowerSource.WiredCurrentType.Ac }
  })

  protected async apply(kind: StateKind, value: KindValue) {
    const { smokeState, coState } = this.endpoint.state.smokeCoAlarm
    const smoke = kind === "smoke" ? value === true : smokeState !== AlarmState.Normal
    const co = kind === "co" ? value === true : coState !== AlarmState.Normal
    await this.endpoint.set({ smokeCoAlarm: BridgedSmokeAlarm.states(smoke, co) })
  }

  /** smoke wins the expressed state, as the louder alarm */
  private static states(smoke: boolean, co: boolean) {
    return {
      smokeState: smoke ? AlarmState.Critical : AlarmState.Normal,
      coState: co ? AlarmState.Critical : AlarmState.Normal,
      expressedState: smoke ? ExpressedState.SmokeAlarm : co ? ExpressedState.CoAlarm : ExpressedState.Normal
    }
  }
}
