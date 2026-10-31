import { StateActuator } from "./StateActuator.ts"

/** A battery level in %. */
export class BatteryState extends StateActuator {
  static readonly id = "battery"
  static readonly label = "Battery % to controllers"
  static readonly description = "The device's battery level in % (0–100); below 20 % the apps warn, below 10 % it is critical"
  static readonly accepts = "number"
  static readonly unit = "%"
  static readonly decimals = 0
  protected readonly kind = "battery"
}
