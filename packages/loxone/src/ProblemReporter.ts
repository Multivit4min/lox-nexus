import type { Cause, Clock, EventBus, MessageSource } from "@lox-nexus/core"

/**
 * Reports problems of one Miniserver as events on its error topic, at most once per QUIET_MS per
 * key. Without this an unreachable host would produce one event per output per resend tick, and
 * a misconfigured signal one per received packet.
 */
export class ProblemReporter {
  static readonly QUIET_MS = 60_000
  /** keys come partly from the network (packet ids), so their number is bounded */
  static readonly MAX_KEYS = 1000
  private readonly reported = new Map<string, { at: number; suppressed: number }>()

  constructor(
    private readonly bus: Pick<EventBus, "event">,
    private readonly topic: string,
    private readonly source: MessageSource,
    private readonly clock: Clock
  ) {}

  /**
   * Publishes the problem unless the same key was reported within QUIET_MS; the next report after
   * that mentions how many were suppressed.
   * @param cause the bus message that triggered it, shown in the Bus Inspector
   * @param key groups repeats of the same problem, e.g. `send:<packetId>` */
  report(key: string, text: string, cause?: Cause) {
    const now = this.clock.now()
    const previous = this.reported.get(key)
    if (previous && now - previous.at < ProblemReporter.QUIET_MS) {
      previous.suppressed++
      return
    }
    this.reported.delete(key)
    this.reported.set(key, { at: now, suppressed: 0 })
    if (this.reported.size > ProblemReporter.MAX_KEYS) this.reported.delete(this.reported.keys().next().value!)
    const suffix = previous?.suppressed ? ` (${previous.suppressed} more since the last report)` : ""
    this.bus.event(this.topic, text + suffix, { source: this.source, ...(cause ? { cause } : {}) })
  }

  /** a readable text for anything that was thrown */
  static message(error: unknown) {
    return error instanceof Error ? error.message : String(error)
  }
}
