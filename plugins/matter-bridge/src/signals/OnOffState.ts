import { StateActuator } from "./StateActuator.ts"

/** Whether a light or plug is on, shown to controllers. */
export class OnOffState extends StateActuator {
  static readonly id = "on-off"
  static readonly label = "On/off state to controllers"
  static readonly description = "Whether the light, plug or fan is on, as the apps show it"
  static readonly accepts = "boolean"
  protected readonly kind = "onOff"
}
