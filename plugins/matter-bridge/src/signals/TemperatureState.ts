import { StateActuator } from "./StateActuator.ts"

/** A temperature in °C, for temperature sensors and the room temperature of thermostats. */
export class TemperatureState extends StateActuator {
  static readonly id = "temperature"
  static readonly label = "Temperature °C to controllers"
  static readonly description = "The temperature in °C (a thermostat's room temperature)"
  static readonly accepts = "number"
  static readonly unit = "°C"
  static readonly decimals = 1
  protected readonly kind = "temperature"
}
