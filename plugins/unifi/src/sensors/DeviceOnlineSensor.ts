import { Value } from "@lox-nexus/plugin-sdk/values"
import type { Device } from "../api/ApiSchemas.ts"
import { DeviceSensor } from "./DeviceSensor.ts"

/** true while the device's state is ONLINE ("Adopted device overview".state). */
export class DeviceOnlineSensor extends DeviceSensor {
  static readonly id = "device-online"
  static readonly label = "Device online"
  static readonly description = "true while the access point, switch or gateway is online"
  static readonly valueType = "boolean"

  protected read(device: Device) {
    return Value.boolean(device.state === "ONLINE")
  }
}
