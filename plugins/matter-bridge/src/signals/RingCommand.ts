import { CommandSensor } from "./CommandSensor.ts"

/** A pulse each time an app plays the chime. */
export class RingCommand extends CommandSensor {
  static readonly id = "ring"
  static readonly label = "Ring from controllers"
  static readonly description = "true for a second each time an app plays the chime (a play during it makes it longer), for a Loxone pushbutton input or a pulse to the audio server"
  static readonly valueType = "boolean"
  protected readonly kind = "ring"
}
