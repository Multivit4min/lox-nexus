/** A calendar day or wall-clock time, months counted from 1. */
export interface WallClock {
  year: number
  month: number
  day: number
  hour?: number
  minute?: number
  second?: number
}

/**
 * An IANA time zone, used where a calendar gives no zone of its own: all-day events start at
 * local midnight, floating times are local wall-clock times, and Loxone counts its date/time in
 * local time. Built on Intl, so it needs no time zone database of its own.
 */
export class Zone {
  /** Loxone's epoch, 2009-01-01 00:00, as a UTC timestamp; Loxone applies it to local time */
  static readonly LOXONE_EPOCH_MS = Date.UTC(2009, 0, 1)
  // feeds name a handful of zones, so this stays small
  private static readonly known = new Map<string, boolean>()
  private readonly parts: Intl.DateTimeFormat

  /** @throws RangeError for a zone Intl doesn't know */
  constructor(readonly id: string) {
    this.parts = new Intl.DateTimeFormat("en-US", {
      timeZone: id, hourCycle: "h23",
      year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric"
    })
  }

  /** asked for every occurrence while reading a feed, so the answers are remembered */
  static isValid(id: string) {
    let valid = Zone.known.get(id)
    if (valid === undefined) {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: id })
        valid = true
      } catch {
        valid = false
      }
      Zone.known.set(id, valid)
    }
    return valid
  }

  /** the wall-clock time in this zone at an instant */
  wallClock(instant: Date): Required<WallClock> {
    const parts = Object.fromEntries(this.parts.formatToParts(instant).map(part => [part.type, Number(part.value)]))
    return {
      year: parts.year ?? 0, month: parts.month ?? 1, day: parts.day ?? 1,
      hour: parts.hour ?? 0, minute: parts.minute ?? 0, second: parts.second ?? 0
    }
  }

  /** milliseconds this zone is ahead of UTC at an instant (+3 600 000 for CET) */
  offsetMs(instant: Date) {
    return this.wallClockUtc(instant) - Math.floor(instant.getTime() / 1000) * 1000
  }

  /**
   * The instant a wall-clock time happens in this zone. A time skipped by a DST change lands an
   * hour later; a repeated one gives its first occurrence.
   */
  instant(wall: WallClock): Date {
    const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour ?? 0, wall.minute ?? 0, wall.second ?? 0)
    // DST changes are far more than 12 hours apart, so the offsets half a day either side are the only candidates
    const candidates = [-43_200_000, 43_200_000].map(shift => asUtc - this.offsetMs(new Date(asUtc + shift)))
    const matching = candidates.filter(candidate => this.wallClockUtc(new Date(candidate)) === asUtc)
    return new Date(Math.min(...(matching.length > 0 ? matching : candidates.slice(0, 1))))
  }

  // the wall-clock time read as if it were UTC
  private wallClockUtc(instant: Date) {
    const wall = this.wallClock(instant)
    return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second)
  }

  /** seconds since 2009-01-01 00:00 local time, the way a Miniserver stores date and time */
  loxoneSeconds(instant: Date) {
    return Math.round((instant.getTime() + this.offsetMs(instant) - Zone.LOXONE_EPOCH_MS) / 1000)
  }

  /** "2026-11-02" in this zone */
  date(instant: Date) {
    const { year, month, day } = this.wallClock(instant)
    return `${year}-${Zone.pad(month)}-${Zone.pad(day)}`
  }

  /** "2026-11-02 18:00" in this zone */
  dateTime(instant: Date) {
    const { hour, minute } = this.wallClock(instant)
    return `${this.date(instant)} ${Zone.pad(hour)}:${Zone.pad(minute)}`
  }

  private static pad(value: number) {
    return String(value).padStart(2, "0")
  }
}
