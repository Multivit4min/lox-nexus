import { DeviceStatisticSensor } from "./DeviceStatisticSensor.ts"

/**
 * A rate of the device's uplink in Mbit/s. The API gives `rxRateBps` and `txRateBps` without a
 * description. Read as bits per second, a busy 24-port switch on a real console showed only
 * tens of kbit/s, so they are taken as bytes per second (an assumption, despite the name): times 8
 * and divided by 10^6 here.
 */
export abstract class DeviceUplinkRateSensor extends DeviceStatisticSensor {
  static readonly BITS_PER_BYTE = 8
  static readonly BITS_PER_MEGABIT = 1_000_000
  static readonly unit = "Mbit/s"
  static readonly decimals = 2

  protected static megabits(bytesPerSecond: number | undefined) {
    return bytesPerSecond === undefined ? undefined : bytesPerSecond * DeviceUplinkRateSensor.BITS_PER_BYTE / DeviceUplinkRateSensor.BITS_PER_MEGABIT
  }
}
