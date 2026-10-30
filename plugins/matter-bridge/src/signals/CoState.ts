import { StateActuator } from "./StateActuator.ts"

/** Whether a carbon monoxide alarm is active (from Nexus; the bridge doesn't measure CO). */
export class CoState extends StateActuator {
  static readonly id = "co"
  static readonly label = "CO alarm to controllers"
  static readonly description = "On (true) while Nexus reports a carbon monoxide alarm; the apps notify"
  static readonly accepts = "boolean"
  protected readonly kind = "co"
}
