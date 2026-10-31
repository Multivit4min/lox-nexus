import { StateActuator } from "./StateActuator.ts"

/** Whether charging is enabled. */
export class ChargingEnabledState extends StateActuator {
  static readonly id = "charging-enabled"
  static readonly label = "Charging enabled to controllers"
  static readonly description = "Whether the wallbox may charge (Loxone's charging release)"
  static readonly accepts = "boolean"
  protected readonly kind = "chargingEnabled"
}
