import { Value } from "@lox-nexus/plugin-sdk/values"
import { CommandSensor } from "./CommandSensor.ts"

/**
 * A pulse each time an app plays the chime. Starts off: a restart during a pulse would otherwise
 * leave Loxone's input on, and the next ring would have no rising edge.
 */
export class RingCommand extends CommandSensor {
  static readonly id = "ring"
  static readonly label = "Ring from controllers"
  static readonly description = "true for a second each time an app plays the chime (a play during it makes it longer), for a Loxone pushbutton input or a pulse to the audio server"
  static readonly valueType = "boolean"
  protected readonly kind = "ring"

  override start() {
    this.emit(Value.boolean(false))
    super.start()
  }
}
