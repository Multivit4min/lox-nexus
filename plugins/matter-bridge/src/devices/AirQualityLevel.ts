import { AirQuality } from "@matter/main/clusters/air-quality"

const { AirQualityEnum } = AirQuality

/**
 * Matter's air quality levels (1 good to 6 extremely poor, 0 unknown) and the level a CO₂ or
 * PM2.5 reading stands for, for sensors that send no level of their own. CO₂ follows the usual
 * indoor bands (up to 750 ppm good, above 5000 ppm extremely poor), PM2.5 the European Air
 * Quality Index.
 */
export class AirQualityLevel {
  static readonly NAMES = ["unknown", "good", "fair", "moderate", "poor", "very poor", "extremely poor"]
  /** upper bounds of good, fair, moderate, poor and very poor; above is extremely poor */
  static readonly CO2_PPM = [750, 1000, 1500, 2000, 5000]
  static readonly PM25_UG = [10, 20, 25, 50, 75]

  /** a level from Nexus, 0–6 */
  static level(value: number): AirQuality.AirQualityEnum {
    if (!Number.isInteger(value) || value < AirQualityEnum.Unknown || value > AirQualityEnum.ExtremelyPoor) {
      throw new Error(`not an air quality level: ${value}; 1 (good) to 6 (extremely poor), 0 unknown`)
    }
    return value
  }

  /** the worse level of the readings there are; unknown without any */
  static of(co2: number | undefined, pm25: number | undefined): AirQuality.AirQualityEnum {
    const levels = [AirQualityLevel.band(co2, AirQualityLevel.CO2_PPM), AirQualityLevel.band(pm25, AirQualityLevel.PM25_UG)]
    return Math.max(AirQualityEnum.Unknown, ...levels)
  }

  private static band(value: number | undefined, bounds: readonly number[]) {
    if (value === undefined || !Number.isFinite(value)) return AirQualityEnum.Unknown
    const index = bounds.findIndex(bound => value <= bound)
    return index === -1 ? AirQualityEnum.ExtremelyPoor : AirQualityEnum.Good + index
  }
}
