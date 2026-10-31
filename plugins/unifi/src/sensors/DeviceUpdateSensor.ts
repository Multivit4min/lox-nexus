import { Value } from "@lox-nexus/plugin-sdk/values"
import type { Device } from "../api/ApiSchemas.ts"
import { DeviceSensor } from "./DeviceSensor.ts"

/** true while a firmware update is available for the device ("Adopted device overview".firmwareUpdatable). */
export class DeviceUpdateSensor extends DeviceSensor {
  static readonly id = "device-update"
  static readonly label = "Firmware update available"
  static readonly description = "true while the console offers a firmware update for the device"
  static readonly valueType = "boolean"

  protected read(device: Device) {
    return Value.boolean(device.firmwareUpdatable)
  }
}
