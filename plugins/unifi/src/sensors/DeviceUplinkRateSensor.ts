import type { Statistics } from "../api/ApiSchemas.ts"
import { DeviceStatisticSensor } from "./DeviceStatisticSensor.ts"

/**
 * A rate of the device's uplink in Mbit/s. The API gives `rxRateBps` and `txRateBps` without a
 * description; read as bits per second, like the API's documented Kbps fields (kilobits per
 * second), and divided by 10^6 here.
 */
export abstract class DeviceUplinkRateSensor extends DeviceStatisticSensor {
  static readonly BITS_PER_MEGABIT = 1_000_000
  static readonly unit = "Mbit/s"
  static readonly decimals = 2

  protected metric(statistics: Statistics) {
    const bits = this.bitsPerSecond(statistics)
    return bits === undefined ? undefined : bits / DeviceUplinkRateSensor.BITS_PER_MEGABIT
  }

  protected abstract bitsPerSecond(statistics: Statistics): number | undefined
}
