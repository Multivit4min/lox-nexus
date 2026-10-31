import { Endpoint } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { ContactSensorDevice } from "@matter/main/devices/contact-sensor"
import { BridgedDevice } from "./BridgedDevice.ts"
import type { KindValue } from "./DeviceKinds.ts"

const ContactEndpoint = ContactSensorDevice.with(BridgedDeviceBasicInformationServer)

/**
 * A door or window contact. Nexus sends "open" (true = open), the natural value of a Loxone
 * digital input; Matter's BooleanState is the other way round (true = contact closed). Starts with
 * the state Nexus sent last, or closed, the state that starts no routine.
 */
export class BridgedContact extends BridgedDevice {
  readonly endpoint = new Endpoint(this.withBattery(ContactEndpoint), {
    id: this.identity.endpointId,
    bridgedDeviceBasicInformation: this.basicInformation(),
    booleanState: { stateValue: this.remembered("contact") !== true }
  })

  protected async apply(_kind: string, value: KindValue) {
    await this.endpoint.set({ booleanState: { stateValue: value !== true } })
  }
}
