import { StateActuator } from "./StateActuator.ts"

/** A voltage. */
export class VoltageState extends StateActuator {
  static readonly id = "voltage"
  static readonly label = "Voltage V to controllers"
  static readonly description = "The voltage in V"
  static readonly accepts = "number"
  static readonly unit = "V"
  static readonly decimals = 0
  protected readonly kind = "voltage"
}
