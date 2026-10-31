import { StateActuator } from "./StateActuator.ts"

/** An electrical power. */
export class PowerState extends StateActuator {
  static readonly id = "power"
  static readonly label = "Power W to controllers"
  static readonly description = "The power the device takes in W; negative while it gives power back (a battery discharging, a meter feeding in)"
  static readonly accepts = "number"
  static readonly unit = "W"
  static readonly decimals = 0
  protected readonly kind = "power"
}
