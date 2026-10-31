import { Observable } from "@matter/main"
import { ChimeServer as BaseChimeServer } from "@matter/main/behaviors/chime"
import type { Chime } from "@matter/main/clusters/chime"
import { Status, StatusResponseError } from "@matter/main/types"

/**
 * A chime that plays nothing itself: "play" from an app goes to Nexus with the sound to play, and
 * Loxone rings (a buzzer, the audio server). The sounds are names for Loxone to tell apart; the
 * apps let you pick one and switch the chime off, which matter.js keeps. While it is off, plays
 * are ignored, as Matter says.
 */
export class ChimeServer extends BaseChimeServer {
  static readonly SOUNDS = ["Ding dong", "Bell", "Gong", "Melody"]

  static override readonly State = class extends BaseChimeServer.State {
    override installedChimeSounds = ChimeServer.SOUNDS.map((name, index) => ({ chimeId: index + 1, name }))
    override selectedChime = 1
    override enabled = true
  }

  static override readonly Events = class extends BaseChimeServer.Events {
    /** an app played a sound (its id), and the controller's action */
    played = Observable<[chimeId: number, context: unknown]>()
  }

  declare readonly events: InstanceType<typeof ChimeServer.Events>

  override playChimeSound(request: Chime.PlayChimeSoundRequest) {
    const chimeId = request.chimeId ?? this.state.selectedChime
    if (!this.state.installedChimeSounds.some(sound => sound.chimeId === chimeId)) {
      throw new StatusResponseError(`no chime sound ${chimeId}`, Status.NotFound)
    }
    if (!this.state.enabled) return
    this.events.chimeStartedPlaying?.emit({ chimeId }, this.context)
    this.events.played.emit(chimeId, this.context)
  }

  /** a sound's name, for the panel */
  static soundName(chimeId: number) {
    return ChimeServer.SOUNDS[chimeId - 1] ?? `sound ${chimeId}`
  }
}
