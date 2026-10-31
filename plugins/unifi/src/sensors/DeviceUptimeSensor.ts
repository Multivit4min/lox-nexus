import type { Statistics } from "../api/ApiSchemas.ts"
import { DeviceStatisticSensor } from "./DeviceStatisticSensor.ts"

/** Seconds since the device started ("Latest statistics for a device".uptimeSec). */
export class DeviceUptimeSensor extends DeviceStatisticSensor {
  static readonly id = "device-uptime"
  static readonly label = "Uptime"
  static readonly description = "Seconds since the device started"
  static readonly unit = "s"
  static readonly decimals = 0
  protected readonly what = "uptime"

  protected metric(statistics: Statistics) {
    return statistics.uptimeSec
  }
}
