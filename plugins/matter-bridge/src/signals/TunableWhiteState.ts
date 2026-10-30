import { StateActuator } from "./StateActuator.ts"

/** A tunable white light's colour temperature and brightness as one value (brightness 0 shows it off). */
export class TunableWhiteState extends StateActuator {
  static readonly id = "tunable-white"
  static readonly label = "Tunable white to controllers"
  static readonly description = "Colour temperature and brightness together, e.g. from a Loxone smart tunable-white actuator; brightness 0 shows the light off"
  static readonly accepts = "tunableWhite"
  protected readonly kind = "tunableWhite"
}
