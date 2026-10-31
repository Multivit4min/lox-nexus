import type { Statistics } from "../api/ApiSchemas.ts"
import { DeviceUplinkRateSensor } from "./DeviceUplinkRateSensor.ts"

/** What the device sends over its uplink, in Mbit/s ("Latest statistics for a device uplink interface".txRateBps). */
export class DeviceUplinkTxSensor extends DeviceUplinkRateSensor {
  static readonly id = "device-uplink-tx"
  static readonly label = "Uplink upload"
  static readonly description = "What the device sends over its uplink, in Mbit/s"
  protected readonly what = "uplink rate (sent)"

  protected bitsPerSecond(statistics: Statistics) {
    return statistics.uplink?.txRateBps
  }
}
