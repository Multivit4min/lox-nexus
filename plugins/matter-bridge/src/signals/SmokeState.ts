import { StateActuator } from "./StateActuator.ts"

/** Whether a smoke alarm is active (from Nexus; the bridge doesn't detect smoke). */
export class SmokeState extends StateActuator {
  static readonly id = "smoke"
  static readonly label = "Smoke alarm to controllers"
  static readonly description = "On (true) while Nexus reports a smoke alarm; the apps notify"
  static readonly accepts = "boolean"
  protected readonly kind = "smoke"
}
