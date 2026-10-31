import { Endpoint, Millis } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { SwitchServer } from "@matter/main/behaviors/switch"
import { DoorbellDevice } from "@matter/main/devices/doorbell"
import { GenericSwitchDevice } from "@matter/main/devices/generic-switch"
import { BridgedDevice } from "./BridgedDevice.ts"
import type { KindValue, StateKind } from "./DeviceKinds.ts"

const ButtonServer = SwitchServer.with("MomentarySwitch", "MomentarySwitchRelease", "MomentarySwitchLongPress", "MomentarySwitchMultiPress")
const ButtonEndpoint = GenericSwitchDevice.with(BridgedDeviceBasicInformationServer, ButtonServer)
const DoorbellEndpoint = DoorbellDevice.with(BridgedDeviceBasicInformationServer, SwitchServer.with("MomentarySwitch", "MomentarySwitchRelease"))

/**
 * A button (momentary generic switch) for routines: a press from Nexus (a Loxone pushbutton or
 * doorbell) becomes Matter's InitialPress and ShortRelease events, then MultiPressComplete (two
 * presses within 300 ms count as a double press); a long press holds the button past the long-press
 * time (LongPress, LongRelease). Only `true` presses; `false`, the end of a pulse, does nothing.
 * A doorbell (Matter 1.4) is the same button with short presses only: InitialPress and ShortRelease.
 */
export class BridgedButton extends BridgedDevice {
  static readonly LONG_PRESS_MS = 1000
  /** how long a long press holds the button, a little past the long-press time */
  static readonly HOLD_MS = BridgedButton.LONG_PRESS_MS + 200

  readonly endpoint = this.type === "doorbell"
    ? new Endpoint(this.withBattery(DoorbellEndpoint), {
      id: this.identity.endpointId,
      bridgedDeviceBasicInformation: this.basicInformation(),
      switch: { numberOfPositions: 2, currentPosition: 0 }
    })
    : new Endpoint(this.withBattery(ButtonEndpoint), {
      id: this.identity.endpointId,
      bridgedDeviceBasicInformation: this.basicInformation(),
      switch: { numberOfPositions: 2, currentPosition: 0, multiPressMax: 2, longPressDelay: Millis(BridgedButton.LONG_PRESS_MS) }
    })

  /** a press is an event, not a state: nothing to remember or set again after a reset */
  override async setState(kind: StateKind, value: KindValue) {
    if (kind === "battery") return super.setState(kind, value)
    if (value !== true) return
    await this.apply(kind, value)
    this.lastState = { kind, value, at: this.context.now() }
  }

  protected async apply(kind: StateKind, value: KindValue) {
    if (value !== true) return
    await this.endpoint.set({ switch: { rawPosition: 1 } })
    if (kind === "longPress") await this.context.wait(BridgedButton.HOLD_MS)
    await this.endpoint.set({ switch: { rawPosition: 0 } })
  }
}
