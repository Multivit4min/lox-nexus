import type { Clock } from "../lifecycle/Clock.ts"
import type { WorkerMessage } from "../wire/WorkerMessages.ts"
import { MessageLimits } from "./MessageLimits.ts"
import { TrailingThrottle } from "./TrailingThrottle.ts"

/** One running action's progress messages: at most four a second, the latest always sent. */
export class ProgressSender {
  static readonly INTERVAL_MS = 250
  private latest: { text: string; fraction?: number } | undefined
  private readonly throttle: TrailingThrottle

  constructor(clock: Clock, send: (message: WorkerMessage) => void, requestId: number) {
    this.throttle = new TrailingThrottle(clock, ProgressSender.INTERVAL_MS, () => {
      if (!this.latest) return
      const { text, fraction } = this.latest
      send({ type: "action.progress", requestId, text, ...(fraction === undefined ? {} : { fraction }) })
    })
  }

  push(text: string, fraction?: number) {
    const clipped = fraction === undefined || !Number.isFinite(fraction) ? undefined : Math.min(1, Math.max(0, fraction))
    this.latest = { text: MessageLimits.clip(String(text)), ...(clipped === undefined ? {} : { fraction: clipped }) }
    this.throttle.call()
  }

  /** the action ended: what is still waiting is dropped */
  close() {
    this.throttle.close()
  }
}
