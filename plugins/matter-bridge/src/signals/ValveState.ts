import { StateActuator } from "./StateActuator.ts"

/** Whether a valve is open. */
export class ValveState extends StateActuator {
  static readonly id = "valve"
  static readonly label = "Valve open to controllers"
  static readonly description = "On (true) while the valve is open, off while it is closed"
  static readonly accepts = "boolean"
  protected readonly kind = "valve"
}
