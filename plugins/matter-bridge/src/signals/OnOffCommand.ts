import { CommandSensor } from "./CommandSensor.ts"

/** On (true) or off (false) from a controller, for lights and plugs. */
export class OnOffCommand extends CommandSensor {
  static readonly id = "on-off"
  static readonly label = "On/off from controllers"
  static readonly description = "On or off when Alexa, Google, Apple or Home Assistant switches the device"
  static readonly valueType = "boolean"
  protected readonly kind = "onOff"
}
