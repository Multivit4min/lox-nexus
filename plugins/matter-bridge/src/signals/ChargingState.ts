import { StateActuator } from "./StateActuator.ts"

/** Whether the car charges. */
export class ChargingState extends StateActuator {
  static readonly id = "charging"
  static readonly label = "Charging to controllers"
  static readonly description = "On (true) while the car charges"
  static readonly accepts = "boolean"
  protected readonly kind = "charging"
}
