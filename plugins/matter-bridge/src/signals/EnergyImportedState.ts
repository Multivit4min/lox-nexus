import { StateActuator } from "./StateActuator.ts"

/** Total energy taken. */
export class EnergyImportedState extends StateActuator {
  static readonly id = "energy-imported"
  static readonly label = "Energy imported kWh to controllers"
  static readonly description = "The energy taken in total, in kWh (a meter's grid import, a battery's charged energy, a wallbox's or heat pump's consumption)"
  static readonly accepts = "number"
  static readonly unit = "kWh"
  static readonly decimals = 1
  protected readonly kind = "energyImported"
}
