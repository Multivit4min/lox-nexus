import type { Value } from "@lox-nexus/plugin-sdk/values"
import type { Device } from "../api/ApiSchemas.ts"
import { MacAddress } from "../api/MacAddress.ts"
import type { NetworkSnapshot } from "../poll/NetworkSnapshot.ts"
import { deviceParamsSchema, type DeviceParams } from "../params/DeviceParams.ts"
import { PollSensor } from "./PollSensor.ts"

/** what a device sensor makes of a poll: a value, a reason it has none, or nothing yet */
export type Reading = Value | { problem: string } | undefined

/** Something about one adopted UniFi device, by MAC. A device the console no longer lists fails the signal. */
export abstract class DeviceSensor<P extends DeviceParams = DeviceParams> extends PollSensor<P> {
  static readonly params = deviceParamsSchema

  /** the device's MAC as the API writes it */
  protected get mac() {
    return MacAddress.normalize(this.params.device)
  }

  protected update(snapshot: NetworkSnapshot) {
    const device = snapshot.device(this.mac)
    if (!device) return this.fail(DeviceSensor.missing(this.mac, snapshot))
    const reading = this.read(device, snapshot)
    if (reading === undefined) return
    if ("problem" in reading) this.fail(reading.problem)
    else this.emit(reading)
  }

  protected abstract read(device: Device, snapshot: NetworkSnapshot): Reading

  // the MACs that would work: a device has several, and the one its label or the UniFi app shows
  // may not be the one the API names it by; the catalog always fills in the API's
  private static missing(mac: string, snapshot: NetworkSnapshot) {
    const known = snapshot.devices.map(device => `${device.name} ${MacAddress.normalize(device.macAddress)}`)
    const list = known.length > 8 ? `${known.slice(0, 8).join(", ")} and ${known.length - 8} more` : known.join(", ")
    return `no device ${mac} on the console (removed, adopted on another site, or not the MAC the API uses for it; add it from the catalog); devices: ${list || "none"}`
  }
}
