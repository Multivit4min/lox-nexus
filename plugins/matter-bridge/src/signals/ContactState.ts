import { StateActuator } from "./StateActuator.ts"

/** Whether a door or window is open (true) or closed (false). */
export class ContactState extends StateActuator {
  static readonly id = "contact"
  static readonly label = "Open to controllers"
  static readonly description = "On (true) while the door or window is open, off while it is closed"
  static readonly accepts = "boolean"
  protected readonly kind = "contact"
}
