import { CommandSensor } from "./CommandSensor.ts"

/** A tunable white light's colour temperature and brightness from controllers, as one value. */
export class TunableWhiteCommand extends CommandSensor {
  static readonly id = "tunable-white"
  static readonly label = "Tunable white from controllers"
  static readonly description = "Colour temperature and brightness together, for a Loxone smart tunable-white actuator; brightness 0 when switched off"
  static readonly valueType = "tunableWhite"
  protected readonly kind = "tunableWhite"
}
