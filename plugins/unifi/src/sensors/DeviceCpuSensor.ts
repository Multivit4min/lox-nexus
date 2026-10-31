import type { Statistics } from "../api/ApiSchemas.ts"
import { DeviceStatisticSensor } from "./DeviceStatisticSensor.ts"

/** The device's CPU load in percent ("Latest statistics for a device".cpuUtilizationPct). */
export class DeviceCpuSensor extends DeviceStatisticSensor {
  static readonly id = "device-cpu"
  static readonly label = "CPU load"
  static readonly description = "The device's CPU load in percent"
  static readonly unit = "%"
  static readonly decimals = 1
  protected readonly what = "the CPU load"

  protected metric(statistics: Statistics) {
    return statistics.cpuUtilizationPct
  }
}
