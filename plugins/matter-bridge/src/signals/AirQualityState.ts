import { StateActuator } from "./StateActuator.ts"

/** Matter's air quality level. */
export class AirQualityState extends StateActuator {
  static readonly id = "air-quality"
  static readonly label = "Air quality level to controllers"
  static readonly description = "1 good, 2 fair, 3 moderate, 4 poor, 5 very poor, 6 extremely poor (0 unknown); without it the level follows the CO₂ and PM2.5 readings"
  static readonly accepts = "number"
  static readonly decimals = 0
  protected readonly kind = "airQuality"
}
