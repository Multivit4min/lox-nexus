import { StateActuator } from "./StateActuator.ts"

/** A long button press for routines: each true holds the button for a second. */
export class LongPressState extends StateActuator {
  static readonly id = "long-press"
  static readonly label = "Long press to controllers"
  static readonly description = "Each on (true) is one long press of the button"
  static readonly accepts = "boolean"
  protected readonly kind = "longPress"
}
