import { StateActuator } from "./StateActuator.ts"

/** Whether it rains. */
export class RainState extends StateActuator {
  static readonly id = "rain"
  static readonly label = "Rain to controllers"
  static readonly description = "On (true) while rain is detected"
  static readonly accepts = "boolean"
  protected readonly kind = "rain"
}
