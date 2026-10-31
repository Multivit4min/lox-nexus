import { StateActuator } from "./StateActuator.ts"

/** A flow in m³/h. */
export class FlowState extends StateActuator {
  static readonly id = "flow"
  static readonly label = "Flow m³/h to controllers"
  static readonly description = "The flow in m³/h (1 m³/h is about 16.7 l/min)"
  static readonly accepts = "number"
  static readonly unit = "m³/h"
  static readonly decimals = 1
  protected readonly kind = "flow"
}
