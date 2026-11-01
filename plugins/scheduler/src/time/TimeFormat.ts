import type { Zone } from "./Zone.ts"

/** how the `next-run` sensor expresses an instant */
export type TimeFormatName = "minutesUntil" | "unix" | "loxone"

/**
 * Turns an instant into the number the `next-run` sensor sends, and says when that number
 * changes. The same formats and "none" values as the Calendar plugin's `time` sensor (copied,
 * since plugins don't share code).
 *
 * Without a next run (switched off, or a schedule that never runs again) `minutesUntil` sends
 * NONE_MINUTES, so a Loxone comparison like "minutes until next run < 30" stays false; `unix`
 * and `loxone` send 0. A run further away than NONE_MINUTES (only 29 February is) is sent as
 * NONE_MINUTES too: "not within 694 days".
 */
export class TimeFormat {
  static readonly NONE_MINUTES = 1_000_000

  constructor(private readonly format: TimeFormatName, private readonly zone: Zone) {}

  value(at: number | undefined, now: number): number {
    if (this.format === "minutesUntil") return at === undefined ? TimeFormat.NONE_MINUTES : Math.min(TimeFormat.minutesUntil(at, now), TimeFormat.NONE_MINUTES)
    if (at === undefined) return 0
    return this.format === "unix" ? Math.floor(at / 1000) : this.zone.loxoneSeconds(at)
  }

  /** when value() for the same instant gives another number; only minutesUntil counts down */
  nextChange(at: number | undefined, now: number): number | undefined {
    if (this.format !== "minutesUntil" || at === undefined) return undefined
    // the value drops by one each time the distance crosses a whole minute
    const minutes = TimeFormat.minutesUntil(at, now)
    return at - (minutes - 1) * 60_000
  }

  /** whole minutes, rounded up: 1 in the last minute before, 0 at the moment itself */
  private static minutesUntil(at: number, now: number) {
    return Math.ceil((at - now) / 60_000) + 0 // + 0 turns -0 into 0
  }
}
