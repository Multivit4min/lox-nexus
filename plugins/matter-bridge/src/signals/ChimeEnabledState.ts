import { StateActuator } from "./StateActuator.ts"

/** Whether the chime is on. */
export class ChimeEnabledState extends StateActuator {
  static readonly id = "chime-enabled"
  static readonly label = "Chime on to controllers"
  static readonly description = "Whether the chime is on; while it is off, plays from the apps are ignored (e.g. muted at night by Loxone)"
  static readonly accepts = "boolean"
  protected readonly kind = "chimeEnabled"
}
