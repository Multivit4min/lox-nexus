import type { Statistics } from "../api/ApiSchemas.ts"
import { DeviceUplinkRateSensor } from "./DeviceUplinkRateSensor.ts"

/** What the device sends over its uplink, in Mbit/s ("Latest statistics for a device uplink interface".txRateBps). */
export class DeviceUplinkTxSensor extends DeviceUplinkRateSensor {
  static readonly id = "device-uplink-tx"
  static readonly label = "Uplink upload"
  static readonly description = "What the device sends over its uplink, in Mbit/s"
  protected readonly what = "uplink rate (sent)"

  /** Mbit/s from a device's latest statistics; undefined when the device doesn't report it (the gateway's uplink is its WAN) */
  static value(statistics: Statistics) {
    return DeviceUplinkRateSensor.megabits(statistics.uplink?.txRateBps)
  }

  protected metric(statistics: Statistics) {
    return DeviceUplinkTxSensor.value(statistics)
  }
}
