import { StateActuator } from "./StateActuator.ts"

/** Whether water may freeze. */
export class FreezeState extends StateActuator {
  static readonly id = "freeze"
  static readonly label = "Frost to controllers"
  static readonly description = "On (true) while a water freeze detector warns of frost"
  static readonly accepts = "boolean"
  protected readonly kind = "freeze"
}
