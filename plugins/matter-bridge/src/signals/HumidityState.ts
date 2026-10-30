import { StateActuator } from "./StateActuator.ts"

/** Relative humidity in %. */
export class HumidityState extends StateActuator {
  static readonly id = "humidity"
  static readonly label = "Humidity % to controllers"
  static readonly description = "The relative humidity in % (0–100)"
  static readonly accepts = "number"
  protected readonly kind = "humidity"
}
