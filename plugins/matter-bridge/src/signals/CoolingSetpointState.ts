import { StateActuator } from "./StateActuator.ts"

/** A thermostat's cooling setpoint in °C. */
export class CoolingSetpointState extends StateActuator {
  static readonly id = "cooling-setpoint"
  static readonly label = "Cooling setpoint °C to controllers"
  static readonly description = "The thermostat's cooling setpoint (16–32 °C)"
  static readonly accepts = "number"
  static readonly unit = "°C"
  static readonly decimals = 1
  protected readonly kind = "coolingSetpoint"
}
