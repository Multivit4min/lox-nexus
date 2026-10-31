import { Endpoint } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { DimmableLightDevice } from "@matter/main/devices/dimmable-light"
import { DimmablePlugInUnitDevice } from "@matter/main/devices/dimmable-plug-in-unit"
import { MountedDimmableLoadControlDevice } from "@matter/main/devices/mounted-dimmable-load-control"
import { BridgedDevice } from "./BridgedDevice.ts"
import type { KindValue, StateKind } from "./DeviceKinds.ts"

const DimmerEndpoint = DimmableLightDevice.with(BridgedDeviceBasicInformationServer)
const PlugEndpoint = DimmablePlugInUnitDevice.with(BridgedDeviceBasicInformationServer)
const WallEndpoint = MountedDimmableLoadControlDevice.with(BridgedDeviceBasicInformationServer)

/**
 * A dimmable light, dimmable plug or wall dimmer (Matter 1.4's mounted dimmable load control). Brightness both ways is the effective brightness: 0 % while off, so a single
 * brightness signal can drive a Loxone dimmer. Matter levels 1–254 map to 1–100 %.
 */
export class BridgedDimmer extends BridgedDevice {
  static readonly MAX_LEVEL = 254

  readonly endpoint = this.create()

  protected override subscribe() {
    const events = this.endpoint.events
    // "on at 50 %" changes on/off and the level in one action: the brightness goes out once
    this.listen(events.onOff.onOff$Changed, (on, _old, context) => {
      if (!BridgedDevice.fromController(context)) return
      this.command("onOff", on, context)
      this.command("brightness", this.brightness(), context)
    })
    this.listen(events.levelControl.currentLevel$Changed, (_level, _old, context) => {
      if (BridgedDevice.fromController(context)) this.command("brightness", this.brightness(), context)
    })
  }

  protected async apply(kind: StateKind, value: KindValue) {
    if (kind === "onOff") return this.endpoint.set({ onOff: { onOff: value === true } })
    const percent = BridgedDevice.number(value)
    if (percent <= 0) return this.endpoint.set({ onOff: { onOff: false } })
    await this.endpoint.set({ onOff: { onOff: true }, levelControl: { currentLevel: BridgedDimmer.level(percent) } })
  }

  private create() {
    const options = {
      id: this.identity.endpointId,
      bridgedDeviceBasicInformation: this.basicInformation(),
      // off until Nexus or a controller says otherwise; the level only shows once it is on
      onOff: { onOff: false },
      levelControl: { currentLevel: BridgedDimmer.MAX_LEVEL }
    }
    if (this.type === "dimmable-plug") return new Endpoint(PlugEndpoint, options)
    if (this.type === "wall-dimmer") return new Endpoint(WallEndpoint, options)
    return new Endpoint(DimmerEndpoint, options)
  }

  /** the brightness the light has now: 0 while off */
  private brightness() {
    const { onOff, levelControl } = this.endpoint.state
    return onOff.onOff ? BridgedDimmer.percent(levelControl.currentLevel ?? BridgedDimmer.MAX_LEVEL) : 0
  }

  static level(percent: number) {
    return BridgedDevice.clamp(Math.round(percent * BridgedDimmer.MAX_LEVEL / 100), 1, BridgedDimmer.MAX_LEVEL)
  }

  static percent(level: number) {
    return BridgedDevice.clamp(Math.round(level * 100 / BridgedDimmer.MAX_LEVEL), 1, 100)
  }
}
