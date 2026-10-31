import { Observable } from "@matter/main"
import { ChimeServer as BaseChimeServer } from "@matter/main/behaviors/chime"
import type { Chime } from "@matter/main/clusters/chime"
import { Status, StatusResponseError } from "@matter/main/types"
import { ChimeSounds } from "./ChimeSounds.ts"

/**
 * A chime that plays nothing itself: "play" from an app goes to Nexus with the sound to play, and
 * Loxone rings (a buzzer, the audio server). The sounds are names for Loxone to tell apart; the
 * apps let you pick one (a sound that isn't installed is refused, NOT_FOUND) and switch the chime
 * off, which matter.js keeps. While it is off, plays are ignored, as Matter says.
 */
export class ChimeServer extends BaseChimeServer {
  static override readonly State = class extends BaseChimeServer.State {
    override installedChimeSounds = ChimeSounds.installed()
    override selectedChime = 1
    override enabled = true
  }

  static override readonly Events = class extends BaseChimeServer.Events {
    /** an app played a sound (its id), and the controller's action */
    played = Observable<[chimeId: number, context: unknown]>()
  }

  declare readonly events: InstanceType<typeof ChimeServer.Events>

  override initialize() {
    super.initialize()
    this.reactTo(this.events.selectedChime$Changing, this.selecting)
  }

  override playChimeSound(request: Chime.PlayChimeSoundRequest) {
    const chimeId = request.chimeId ?? this.state.selectedChime
    if (!ChimeSounds.has(chimeId)) throw new StatusResponseError(`no chime sound ${chimeId}`, Status.NotFound)
    if (!this.state.enabled) return
    // Matter has the event from the cluster's revision 2 on; matter.js 0.18 doesn't create it yet
    this.events.chimeStartedPlaying?.emit({ chimeId }, this.context)
    this.events.played.emit(chimeId, this.context)
  }

  // an app picking a sound that isn't installed would break every play without a sound
  private selecting(chimeId: number) {
    if (!ChimeSounds.has(chimeId)) throw new StatusResponseError(`no chime sound ${chimeId}`, Status.NotFound)
  }
}
