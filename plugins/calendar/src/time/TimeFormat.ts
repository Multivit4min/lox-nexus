import type { Zone } from "./Zone.ts"

/** how the `time` sensor expresses an instant */
export type TimeFormatName = "minutesUntil" | "unix" | "loxone"

/**
 * Turns an instant into the number the `time` sensor sends, and says when that number changes.
 *
 * Without an event there is no instant. `minutesUntil` then sends NONE_MINUTES, a value beyond
 * every real one (occurrences are read up to 400 days ahead, about 576 000 minutes), so a
 * Loxone comparison like "minutes until next start < 30" stays false. `unix` and `loxone` send 0,
 * a date no calendar event has.
 */
export class TimeFormat {
  static readonly NONE_MINUTES = 1_000_000

  constructor(private readonly format: TimeFormatName, private readonly zone: Zone) {}

  value(at: Date | undefined, now: number): number {
    if (this.format === "minutesUntil") return at ? TimeFormat.minutesUntil(at.getTime(), now) : TimeFormat.NONE_MINUTES
    if (!at) return 0
    return this.format === "unix" ? Math.floor(at.getTime() / 1000) : this.zone.loxoneSeconds(at)
  }

  /** when value() for the same instant gives another number; only minutesUntil counts down */
  nextChange(at: Date | undefined, now: number): number | undefined {
    if (this.format !== "minutesUntil" || !at) return undefined
    // the value drops by one each time the distance crosses a whole minute
    const minutes = TimeFormat.minutesUntil(at.getTime(), now)
    return at.getTime() - (minutes - 1) * 60_000
  }

  /** whole minutes, rounded up: 1 in the last minute before, 0 in the first minute after, then negative */
  private static minutesUntil(at: number, now: number) {
    return Math.ceil((at - now) / 60_000) + 0 // + 0 turns -0 into 0
  }
}
