import { Endpoint } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { MountedOnOffControlDevice } from "@matter/main/devices/mounted-on-off-control"
import { OnOffLightDevice } from "@matter/main/devices/on-off-light"
import { OnOffPlugInUnitDevice } from "@matter/main/devices/on-off-plug-in-unit"
import { BridgedDevice } from "./BridgedDevice.ts"
import type { KindValue } from "./DeviceKinds.ts"

const LightEndpoint = OnOffLightDevice.with(BridgedDeviceBasicInformationServer)
const PlugEndpoint = OnOffPlugInUnitDevice.with(BridgedDeviceBasicInformationServer)
const WallEndpoint = MountedOnOffControlDevice.with(BridgedDeviceBasicInformationServer)

/** An on/off light, plug or wall switch (Matter 1.4's mounted on/off control): one on/off command, one on/off state. Starts off. */
export class BridgedSwitch extends BridgedDevice {
  readonly endpoint = this.create()

  protected override subscribe() {
    this.listen(this.endpoint.events.onOff.onOff$Changed, (on, _old, context) => {
      if (BridgedDevice.fromController(context)) this.command("onOff", on)
    })
  }

  protected async apply(_kind: string, value: KindValue) {
    await this.endpoint.set({ onOff: { onOff: value === true } })
  }

  private create() {
    const options = { id: this.identity.endpointId, bridgedDeviceBasicInformation: this.basicInformation() }
    if (this.type === "plug") return new Endpoint(PlugEndpoint, options)
    if (this.type === "wall-switch") return new Endpoint(WallEndpoint, options)
    return new Endpoint(LightEndpoint, options)
  }
}
