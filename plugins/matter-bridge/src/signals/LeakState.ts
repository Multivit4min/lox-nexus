import { StateActuator } from "./StateActuator.ts"

/** Whether a water leak is detected. */
export class LeakState extends StateActuator {
  static readonly id = "leak"
  static readonly label = "Leak to controllers"
  static readonly description = "On (true) while a water leak is detected"
  static readonly accepts = "boolean"
  protected readonly kind = "leak"
}
