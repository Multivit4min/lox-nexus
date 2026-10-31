import { StateActuator } from "./StateActuator.ts"

/** The energy of the charging session. */
export class SessionEnergyState extends StateActuator {
  static readonly id = "session-energy"
  static readonly label = "Session energy kWh to controllers"
  static readonly description = "The energy charged since the car was plugged in, in kWh"
  static readonly accepts = "number"
  static readonly unit = "kWh"
  static readonly decimals = 2
  protected readonly kind = "sessionEnergy"
}
