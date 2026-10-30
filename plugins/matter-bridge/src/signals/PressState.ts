import { StateActuator } from "./StateActuator.ts"

/** A button press for routines: each true (a pulse) is one short press. */
export class PressState extends StateActuator {
  static readonly id = "press"
  static readonly label = "Press to controllers"
  static readonly description = "Each on (true), e.g. a Loxone pulse, is one short press of the button; two within 300 ms are a double press"
  static readonly accepts = "boolean"
  protected readonly kind = "press"
}
