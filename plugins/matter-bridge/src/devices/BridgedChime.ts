import { Endpoint } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { ChimeDevice } from "@matter/main/devices/chime"
import { BridgedDevice } from "./BridgedDevice.ts"
import { ChimeServer } from "./ChimeServer.ts"
import type { KindValue } from "./DeviceKinds.ts"

const ChimeEndpoint = ChimeDevice.with(BridgedDeviceBasicInformationServer, ChimeServer)

/**
 * A chime (bell): when an app plays it, Nexus gets the sound (1–4) and then a one-second pulse to
 * ring with, so a Loxone pushbutton input or a pulse to the audio server rings. A play during the
 * pulse makes it longer, not a second short one. Whether the chime is on goes both ways.
 */
export class BridgedChime extends BridgedDevice {
  static readonly PULSE_MS = 1000

  readonly endpoint = new Endpoint(ChimeEndpoint, {
    id: this.identity.endpointId,
    bridgedDeviceBasicInformation: this.basicInformation()
  })

  /** counts rings: only the latest one ends the pulse */
  private rings = 0

  protected override subscribe() {
    const events = this.endpoint.events.chime
    this.listen(events.played, (chimeId, context) => this.ring(chimeId, context))
    this.listen(events.enabled$Changed, (enabled, _old, context) => {
      if (BridgedDevice.fromController(context)) this.command("chimeEnabled", enabled, context)
    })
  }

  protected async apply(_kind: string, value: KindValue) {
    await this.endpoint.set({ chime: { enabled: value === true } })
  }

  private ring(chimeId: number, context: unknown) {
    const ring = ++this.rings
    this.command("chimeSound", chimeId, context)
    this.command("ring", true, context)
    this.context.wait(BridgedChime.PULSE_MS)
      .then(() => {
        if (ring === this.rings) this.command("ring", false)
      })
      .catch((error: unknown) => this.context.warn(`chime "${this.name}": ${error instanceof Error ? error.message : String(error)}`))
  }
}
