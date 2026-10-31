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
    if (!device) return this.fail(`no device ${this.mac} on the console (removed, or adopted on another site)`)
    const reading = this.read(device, snapshot)
    if (reading === undefined) return
    if ("problem" in reading) this.fail(reading.problem)
    else this.emit(reading)
  }

  protected abstract read(device: Device, snapshot: NetworkSnapshot): Reading
}
