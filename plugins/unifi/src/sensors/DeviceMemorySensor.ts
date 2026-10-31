import type { Statistics } from "../api/ApiSchemas.ts"
import { DeviceStatisticSensor } from "./DeviceStatisticSensor.ts"

/** The device's memory use in percent ("Latest statistics for a device".memoryUtilizationPct). */
export class DeviceMemorySensor extends DeviceStatisticSensor {
  static readonly id = "device-memory"
  static readonly label = "Memory use"
  static readonly description = "The device's memory use in percent"
  static readonly unit = "%"
  static readonly decimals = 1
  protected readonly what = "the memory use"

  /** the number from a device's latest statistics; undefined when the device doesn't report it (also the catalog's) */
  static value(statistics: Statistics) {
    return statistics.memoryUtilizationPct
  }

  protected metric(statistics: Statistics) {
    return DeviceMemorySensor.value(statistics)
  }
}
