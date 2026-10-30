import { StateActuator } from "./StateActuator.ts"

/** Whether motion or presence is detected. */
export class OccupancyState extends StateActuator {
  static readonly id = "occupancy"
  static readonly label = "Occupied to controllers"
  static readonly description = "On (true) while motion or presence is detected"
  static readonly accepts = "boolean"
  protected readonly kind = "occupancy"
}
