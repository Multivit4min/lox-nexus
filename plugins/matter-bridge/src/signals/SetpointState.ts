import { StateActuator } from "./StateActuator.ts"

/** A thermostat's heating setpoint in °C. */
export class SetpointState extends StateActuator {
  static readonly id = "setpoint"
  static readonly label = "Heating setpoint °C to controllers"
  static readonly description = "The thermostat's setpoint in °C; Matter limits it to 7–30 °C"
  static readonly accepts = "number"
  protected readonly kind = "setpoint"
}
