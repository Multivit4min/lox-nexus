import { Endpoint } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { FanControl } from "@matter/main/clusters/fan-control"
import { FanDevice } from "@matter/main/devices/fan"
import { BridgedDevice } from "./BridgedDevice.ts"
import type { KindValue, StateKind } from "./DeviceKinds.ts"
import { FanServer } from "./FanServer.ts"

const FanEndpoint = FanDevice.with(BridgedDeviceBasicInformationServer, FanServer)

/**
 * A fan: on/off and speed in %. A controller sets the speed or the mode (off, low, medium, high),
 * which becomes a speed command; on is the speed above 0. The speed Nexus sends is what the apps
 * show. Starts off.
 */
export class BridgedFan extends BridgedDevice {
  readonly endpoint = new Endpoint(FanEndpoint, {
    id: this.identity.endpointId,
    bridgedDeviceBasicInformation: this.basicInformation(),
    fanControl: {
      fanMode: FanControl.FanMode.Off,
      fanModeSequence: FanControl.FanModeSequence.OffLowMedHigh,
      percentSetting: 0,
      percentCurrent: 0
    }
  })

  /** what "on" from Nexus goes back to: the last speed above 0, from Nexus or a controller */
  private lastSpeed = 100

  protected override subscribe() {
    this.listen(this.endpoint.events.fanControl.percentSetting$Changed, (percent, old, context) => {
      if (percent === null || !BridgedDevice.fromController(context)) return
      if (percent > 0) this.lastSpeed = percent
      // on/off only when it changes, not with every speed
      if ((old ?? 0) > 0 !== percent > 0) this.command("onOff", percent > 0, context)
      this.command("fanSpeed", percent, context)
    })
  }

  protected async apply(kind: StateKind, value: KindValue) {
    if (kind === "onOff") {
      const current = this.endpoint.state.fanControl.percentCurrent ?? 0
      if (value === true && current > 0) return
      return this.setSpeed(value === true ? this.lastSpeed : 0)
    }
    await this.setSpeed(BridgedDevice.clamp(Math.round(BridgedDevice.number(value)), 0, 100))
  }

  private async setSpeed(percent: number) {
    if (percent > 0) this.lastSpeed = percent
    await this.endpoint.set({ fanControl: { percentSetting: percent, percentCurrent: percent } })
  }
}
