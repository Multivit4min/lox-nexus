import type { Zone } from "../time/Zone.ts"
import type { CronExpression } from "./CronExpression.ts"

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
const MINUTE_MS = 60_000

/**
 * The instants a cron expression matches in a time zone.
 *
 * DST: a schedule with a fixed hour (`30 2 * * *`, every time-of-day schedule) follows the wall
 * clock. Its time runs once when DST ends (the first of the two), and at the first minute after
 * the gap when the time is skipped (02:30 → 03:00). A schedule with `*` as its hour (hourly,
 * every 5 minutes) follows real time instead, as in ISC cron: it runs in both passes of the
 * repeated hour, and nothing of it falls into the gap.
 */
export class CronSchedule {
  /**
   * how far to look for a matching date: 29 February can be 8 years away (2096 to 2104), and
   * nothing valid is further
   */
  static readonly SEARCH_DAYS = 8 * 366 + 2
  /** days whose instants are remembered: a schedule asks about the same few days every minute */
  private static readonly CACHED_DAYS = 32
  private readonly days = new Map<number, number[]>()
  /** instants that times in a DST gap moved to, with the latest such time; a few a year */
  private readonly moved = new Map<number, number>()

  constructor(readonly expression: CronExpression, readonly zone: Zone) {}

  /** the first instant after `after`, or undefined if there is none within SEARCH_DAYS */
  next(after: number): number | undefined {
    const start = this.dayOf(after) - DAY_MS // the day before: a repeated hour may run past midnight
    for (let day = 0; day <= CronSchedule.SEARCH_DAYS; day++) {
      const found = this.on(start + day * DAY_MS).find(instant => instant > after)
      if (found !== undefined) return found
    }
    return undefined
  }

  /** the last instant at or before `atOrBefore`, or undefined if there is none within SEARCH_DAYS */
  previous(atOrBefore: number): number | undefined {
    const start = this.dayOf(atOrBefore) + DAY_MS
    for (let day = 0; day <= CronSchedule.SEARCH_DAYS; day++) {
      const found = this.on(start - day * DAY_MS).findLast(instant => instant <= atOrBefore)
      if (found !== undefined) return found
    }
    return undefined
  }

  /** local midnight of the day an instant falls on, as if it were UTC */
  private dayOf(instant: number) {
    return this.zone.localMidnight(instant)
  }

  /**
   * The wall-clock time (as if it were UTC) the schedule meant for one of its instants: the time
   * itself as a rule, but for times moved past the DST gap the latest of them (02:45 for 03:00
   * when 02:15 and 02:45 both moved there). Merged schedules break ties with it.
   */
  scheduledWall(instant: number) {
    return this.moved.get(instant) ?? instant + this.zone.offsetMs(instant)
  }

  /** the matching instants of a local date (its midnight as if it were UTC), ascending */
  private on(midnight: number): number[] {
    const date = new Date(midnight)
    // cheap without Intl, so not cached: a search for 29 February passes thousands of such days
    if (!this.expression.matchesDate(date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCDay())) return []
    let instants = this.days.get(midnight)
    if (instants === undefined) {
      instants = this.compute(midnight)
      if (this.days.size >= CronSchedule.CACHED_DAYS) this.days.delete(this.days.keys().next().value ?? midnight)
      this.days.set(midnight, instants)
    }
    return instants
  }

  private compute(midnight: number): number[] {
    const times = this.expression.hours.flatMap(hour => this.expression.minutes.map(minute => midnight + hour * HOUR_MS + minute * MINUTE_MS))
    // the instants of a day lie within a day either side of its midnight read as UTC
    const offset = this.zone.offsetMs(midnight - DAY_MS)
    if (offset === this.zone.offsetMs(midnight + 2 * DAY_MS)) return times.map(time => time - offset)
    return this.acrossChange(times)
  }

  // a day with a DST change: only here is the slow path through Intl needed for every time
  private acrossChange(times: number[]): number[] {
    const instants = this.expression.everyHour
      ? times.flatMap(time => this.zone.instants(time))
      : times.map(time => this.resolveRemembering(time))
    return [...new Set(instants)].sort((a, b) => a - b)
  }

  private resolveRemembering(time: number) {
    const instant = this.zone.resolve(time)
    if (instant + this.zone.offsetMs(instant) !== time) this.moved.set(instant, Math.max(time, this.moved.get(instant) ?? time))
    return instant
  }
}
