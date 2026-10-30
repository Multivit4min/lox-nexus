import { StateActuator } from "./StateActuator.ts"

/** A fan's speed in %, shown to controllers; 0 shows it off. */
export class FanSpeedState extends StateActuator {
  static readonly id = "fan-speed"
  static readonly label = "Fan speed % to controllers"
  static readonly description = "The fan's speed (0–100); 0 shows it off"
  static readonly accepts = "number"
  static readonly unit = "%"
  static readonly decimals = 0
  protected readonly kind = "fanSpeed"
}
