import { StateActuator } from "./StateActuator.ts"

/** Fine dust (PM2.5) in µg/m³. */
export class Pm25State extends StateActuator {
  static readonly id = "pm25"
  static readonly label = "PM2.5 µg/m³ to controllers"
  static readonly description = "The fine dust (PM2.5) concentration in µg/m³"
  static readonly accepts = "number"
  static readonly unit = "µg/m³"
  static readonly decimals = 0
  protected readonly kind = "pm25"
}
