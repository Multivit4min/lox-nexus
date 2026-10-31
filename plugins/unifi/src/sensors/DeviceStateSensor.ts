import { Value } from "@lox-nexus/plugin-sdk/values"
import type { Device } from "../api/ApiSchemas.ts"
import { DeviceSensor } from "./DeviceSensor.ts"

/** The device's state as the API names it: ONLINE, OFFLINE, UPDATING, GETTING_READY, ADOPTING, … */
export class DeviceStateSensor extends DeviceSensor {
  static readonly id = "device-state"
  static readonly label = "Device state"
  static readonly description = "The device's state as text, e.g. ONLINE, OFFLINE or UPDATING"
  static readonly valueType = "string"

  protected read(device: Device) {
    return Value.string(device.state)
  }
}
