const DAY = 86_400_000
/** the largest time value a Date holds; Intl throws beyond it */
const LIMIT = 8.64e15
/** offsets change on quarter hours in every zone in use today, so one lookup serves a quarter hour */
const BUCKET = 900_000
const CACHED = 4096

/**
 * UTC offsets of one IANA time zone at any instant, through Intl, so it works whatever zone the
 * process runs in. "Wall" times are a zone's local date and time written as if they were UTC
 * (Date.UTC of the local fields), which lets them use the UTC methods of Date.
 */
export class ZoneOffsets {
  private readonly parts: Intl.DateTimeFormat
  private readonly names: Intl.DateTimeFormat
  // formatToParts costs tens of microseconds, too much for a script that loops over dates
  private readonly cache = new Map<number, number>()

  /** @throws RangeError for a zone the runtime doesn't know */
  constructor(readonly zone: string) {
    this.parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone, hourCycle: "h23", era: "short", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric"
    })
    this.names = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "long" })
  }

  /** milliseconds to add to a UTC time for the zone's wall time; NaN for NaN */
  offsetAt(utc: number): number {
    if (!Number.isFinite(utc)) return NaN
    const bucket = Math.floor(utc / BUCKET)
    const cached = this.cache.get(bucket)
    if (cached !== undefined) return cached
    if (this.cache.size >= CACHED) this.cache.clear()
    const offset = this.lookup(Math.min(Math.max(bucket * BUCKET, -LIMIT), LIMIT))
    this.cache.set(bucket, offset)
    return offset
  }

  private lookup(utc: number): number {
    const fields = Object.fromEntries(this.parts.formatToParts(utc).map(part => [part.type, part.value]))
    const year = fields.era === "BC" ? 1 - Number(fields.year) : Number(fields.year)
    const wall = new Date(0)
    // setUTCFullYear, unlike Date.UTC, doesn't move years 0 to 99 into the 1900s
    wall.setUTCFullYear(year, Number(fields.month) - 1, Number(fields.day))
    wall.setUTCHours(Number(fields.hour), Number(fields.minute), Number(fields.second))
    return wall.getTime() - Math.floor(utc / 1000) * 1000
  }

  /** the zone's wall time at a UTC time */
  wall(utc: number): number {
    return utc + this.offsetAt(utc)
  }

  /**
   * The UTC time of a wall time, as Date does it for the local zone: a time that occurs twice
   * (clocks turned back) is the earlier one, a time that is skipped (clocks turned forward) is
   * moved forward by the gap.
   */
  utc(wall: number): number {
    if (!Number.isFinite(wall)) return NaN
    const before = this.offsetAt(wall - DAY)
    const after = this.offsetAt(wall + DAY)
    const valid = [before, after].map(offset => wall - offset).filter(utc => this.offsetAt(utc) === wall - utc)
    return valid.length > 0 ? Math.min(...valid) : wall - before
  }

  /** e.g. "Central European Standard Time" */
  name(utc: number): string {
    return this.names.formatToParts(utc).find(part => part.type === "timeZoneName")?.value ?? this.zone
  }
}
