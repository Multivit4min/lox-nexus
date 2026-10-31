import { StateActuator } from "./StateActuator.ts"

/** Total energy given. */
export class EnergyExportedState extends StateActuator {
  static readonly id = "energy-exported"
  static readonly label = "Energy exported kWh to controllers"
  static readonly description = "The energy given in total, in kWh (a meter's feed-in, a PV system's production, a battery's discharged energy)"
  static readonly accepts = "number"
  static readonly unit = "kWh"
  static readonly decimals = 1
  protected readonly kind = "energyExported"
}
