/** A wall-clock time, months counted from 1. */
export interface WallClock {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const HOUR_MS = 3_600_000
const MINUTE_MS = 60_000
const DAY_MS = 86_400_000
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/**
 * An IANA time zone: the wall clock schedules are written in, and the one Loxone counts its date
 * and time in. Built on Intl, so it needs no time zone database of its own. (Copied from the
 * Calendar plugin and extended with DST gaps; plugins don't share code.)
 */
export class Zone {
  /** Loxone's epoch, 2009-01-01 00:00, as a UTC timestamp; Loxone applies it to local time */
  static readonly LOXONE_EPOCH_MS = Date.UTC(2009, 0, 1)
  private static readonly CACHED_DAYS = 8
  private readonly parts: Intl.DateTimeFormat
  /** recent local days without a DST change, as the instants they span; Intl is slow, and schedules ask about the same days every minute */
  private readonly days: Array<{ from: number; to: number; midnight: number }> = []

  /** @throws RangeError for a zone Intl doesn't know */
  constructor(readonly id: string) {
    this.parts = new Intl.DateTimeFormat("en-US", {
      timeZone: id, hourCycle: "h23",
      year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric"
    })
  }

  static isValid(id: string) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: id })
      return true
    } catch {
      return false
    }
  }

  /** the wall-clock time in this zone at an instant */
  wallClock(instant: number): WallClock {
    const parts = Object.fromEntries(this.parts.formatToParts(instant).map(part => [part.type, Number(part.value)]))
    return {
      year: parts.year ?? 0, month: parts.month ?? 1, day: parts.day ?? 1,
      hour: parts.hour ?? 0, minute: parts.minute ?? 0, second: parts.second ?? 0
    }
  }

  /** milliseconds this zone is ahead of UTC at an instant (+3 600 000 for CET) */
  offsetMs(instant: number) {
    return this.wallClockUtc(instant) - Math.floor(instant / 1000) * 1000
  }

  /**
   * The instants a wall-clock time (given as if it were UTC) happens at: one as a rule, two in the
   * hour repeated when DST ends, none in the hour skipped when it starts.
   */
  instants(wallAsUtc: number): number[] {
    // DST changes are far more than 12 hours apart, so the offsets half a day either side are the only candidates
    const candidates = new Set([-12 * HOUR_MS, 12 * HOUR_MS].map(shift => wallAsUtc - this.offsetMs(wallAsUtc + shift)))
    return [...candidates].filter(candidate => this.wallClockUtc(candidate) === wallAsUtc).sort((a, b) => a - b)
  }

  /**
   * The instant of a wall-clock time as a schedule means it: the first of two in the repeated
   * hour, and for a time skipped by DST the first minute after the gap (02:30 → 03:00).
   */
  resolve(wallAsUtc: number): number {
    const [first] = this.instants(wallAsUtc)
    if (first !== undefined) return first
    // in a gap: the offset before it makes the instant too late, the one after too early
    let early = Math.min(...[-12, 12].map(hours => wallAsUtc - this.offsetMs(wallAsUtc + hours * HOUR_MS)))
    let late = Math.max(...[-12, 12].map(hours => wallAsUtc - this.offsetMs(wallAsUtc + hours * HOUR_MS)))
    while (late - early > MINUTE_MS) {
      const middle = early + Math.floor((late - early) / 2 / MINUTE_MS) * MINUTE_MS
      if (this.wallClockUtc(middle) > wallAsUtc) late = middle
      else early = middle
    }
    return late
  }

  /** the local date of an instant, as its midnight read as UTC */
  localMidnight(instant: number) {
    const known = this.days.find(day => day.from <= instant && instant < day.to)
    if (known) return known.midnight
    const { year, month, day } = this.wallClock(instant)
    const midnight = Date.UTC(year, month - 1, day)
    // only a day whose offset is the same a day either side has one simple span
    const offset = this.offsetMs(midnight - DAY_MS)
    if (offset === this.offsetMs(midnight + 2 * DAY_MS)) {
      if (this.days.length >= Zone.CACHED_DAYS) this.days.shift()
      this.days.push({ from: midnight - offset, to: midnight - offset + DAY_MS, midnight })
    }
    return midnight
  }

  /** seconds since 2009-01-01 00:00 local time, the way a Miniserver stores date and time */
  loxoneSeconds(instant: number) {
    return Math.round((instant + this.offsetMs(instant) - Zone.LOXONE_EPOCH_MS) / 1000)
  }

  /** "Mon 2026-11-02 18:00" in this zone */
  dateTime(instant: number) {
    const { year, month, day, hour, minute } = this.wallClock(instant)
    const weekday = WEEKDAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
    return `${weekday} ${year}-${Zone.pad(month)}-${Zone.pad(day)} ${Zone.pad(hour)}:${Zone.pad(minute)}`
  }

  // the wall-clock time read as if it were UTC
  private wallClockUtc(instant: number) {
    const wall = this.wallClock(instant)
    return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second)
  }

  private static pad(value: number) {
    return String(value).padStart(2, "0")
  }
}
