import { StateActuator } from "./StateActuator.ts"

/** The charging mode. */
export class ChargingModeState extends StateActuator {
  static readonly id = "charging-mode"
  static readonly label = "Charging mode to controllers"
  static readonly description = "The wallbox's charging mode as text: manual, time-of-use or solar"
  static readonly accepts = "string"
  protected readonly kind = "chargingMode"
}
