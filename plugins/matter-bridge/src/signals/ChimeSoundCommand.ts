import { CommandSensor } from "./CommandSensor.ts"

/** Which sound an app played. */
export class ChimeSoundCommand extends CommandSensor {
  static readonly id = "chime-sound"
  static readonly label = "Chime sound from controllers"
  static readonly description = "The sound an app played, just before the ring: 1 Ding dong, 2 Bell, 3 Gong, 4 Melody"
  static readonly valueType = "number"
  static readonly decimals = 0
  protected readonly kind = "chimeSound"
}
