/** Counters and the latest state of the connection, for the panel. In memory only. */
export class TrafficStats {
  state: "connecting" | "connected" | "waiting" | "stopped" = "connecting"
  received = 0
  published = 0
  publishFailed = 0
  connectedSince: number | undefined
  nextAttemptAt: number | undefined
  lastError: { at: number; message: string } | undefined

  failed(message: string, now: number) {
    this.lastError = { at: now, message }
  }
}
