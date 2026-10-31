import { StateActuator } from "./StateActuator.ts"

/** A thermostat's mode: off, heat, cool or auto. */
export class ModeState extends StateActuator {
  static readonly id = "mode"
  static readonly label = "Mode to controllers"
  static readonly description = "The thermostat's mode as text: off, heat, cool or auto"
  static readonly accepts = "string"
  protected readonly kind = "mode"
}
