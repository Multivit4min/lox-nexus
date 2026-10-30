import { Endpoint } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { OnOffLightDevice } from "@matter/main/devices/on-off-light"
import { OnOffPlugInUnitDevice } from "@matter/main/devices/on-off-plug-in-unit"
import { BridgedDevice } from "./BridgedDevice.ts"
import type { KindValue } from "./DeviceKinds.ts"

const LightEndpoint = OnOffLightDevice.with(BridgedDeviceBasicInformationServer)
const PlugEndpoint = OnOffPlugInUnitDevice.with(BridgedDeviceBasicInformationServer)

/** An on/off light or plug: one on/off command, one on/off state. Starts off. */
export class BridgedSwitch extends BridgedDevice {
  readonly endpoint = this.type === "plug"
    ? new Endpoint(PlugEndpoint, { id: this.identity.endpointId, bridgedDeviceBasicInformation: this.basicInformation() })
    : new Endpoint(LightEndpoint, { id: this.identity.endpointId, bridgedDeviceBasicInformation: this.basicInformation() })

  protected override subscribe() {
    this.listen(this.endpoint.events.onOff.onOff$Changed, (on, _old, context) => {
      if (BridgedDevice.fromController(context)) this.command("onOff", on)
    })
  }

  protected async apply(_kind: string, value: KindValue) {
    await this.endpoint.set({ onOff: { onOff: value === true } })
  }
}
