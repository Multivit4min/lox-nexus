import { Sensor } from "@lox-nexus/plugin-sdk"
import type { NetworkSnapshot } from "../poll/NetworkSnapshot.ts"
import type { UnifiPlugin } from "../UnifiPlugin.ts"

/**
 * A sensor fed by the poll loop: it reads each new snapshot, and fails with the poll's reason
 * while the console can't be read. The next good poll emits again, which ends the failure.
 */
export abstract class PollSensor<Params> extends Sensor<UnifiPlugin, Params> {
  override start() {
    const poller = this.plugin.poller
    this.listen(poller, "data", (snapshot: NetworkSnapshot) => this.update(snapshot))
    this.listen(poller, "failed", (message: string) => this.fail(PollSensor.unreachable(message)))
    // a sensor added to a running poller shows the data at hand instead of waiting for the next poll
    if (poller.problem !== undefined) this.fail(PollSensor.unreachable(poller.problem))
    else if (poller.latest) this.update(poller.latest)
  }

  protected abstract update(snapshot: NetworkSnapshot): void

  private static unreachable(message: string) {
    return `can't read the UniFi console: ${message}`
  }
}
