import type { Statistics } from "../api/ApiSchemas.ts"
import { DeviceUplinkRateSensor } from "./DeviceUplinkRateSensor.ts"

/** What the device receives over its uplink, in Mbit/s ("Latest statistics for a device uplink interface".rxRateBps). */
export class DeviceUplinkRxSensor extends DeviceUplinkRateSensor {
  static readonly id = "device-uplink-rx"
  static readonly label = "Uplink download"
  static readonly description = "What the device receives over its uplink, in Mbit/s"
  protected readonly what = "uplink rate (received)"

  /** Mbit/s from a device's latest statistics; undefined when the device doesn't report it (the gateway's uplink is its WAN) */
  static value(statistics: Statistics) {
    return DeviceUplinkRateSensor.megabits(statistics.uplink?.rxRateBps)
  }

  protected metric(statistics: Statistics) {
    return DeviceUplinkRxSensor.value(statistics)
  }
}
