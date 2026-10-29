import { ZoneOffsets } from "./ZoneOffsets.ts"

type NumberMethod = (this: Date, ...args: number[]) => number
type TextMethod = (this: Date, ...args: unknown[]) => string

const GETTERS = {
  getFullYear: "getUTCFullYear", getMonth: "getUTCMonth", getDate: "getUTCDate", getDay: "getUTCDay",
  getHours: "getUTCHours", getMinutes: "getUTCMinutes", getSeconds: "getUTCSeconds", getMilliseconds: "getUTCMilliseconds"
} as const
const SETTERS = {
  setFullYear: "setUTCFullYear", setMonth: "setUTCMonth", setDate: "setUTCDate",
  setHours: "setUTCHours", setMinutes: "setUTCMinutes", setSeconds: "setUTCSeconds", setMilliseconds: "setUTCMilliseconds"
} as const
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
/** a text with its own offset or zone (`…10:00Z`, `…10:00+01:00`, `GMT+0100`, `EST`); everything else is local time */
const ZONED = /\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(?:Z|[+-]\d{2}(?::?\d{2})?)\s*$|\b(?:GMT|UTC|UT|[ECMP][SD]T)\b/i
/** exactly an ISO date without a time, which the standard reads as UTC; V8 reads anything looser as local */
const DATE_ONLY = /^(?:\d{4}|[+-]\d{6})(?:-\d{2}(?:-\d{2})?)?$/
/** an ISO date and time, which takes a "Z"; other local texts take " UTC" */
const ISO_TIME = /^(?:\d{4}|[+-]\d{6})-\d{2}-\d{2}T/i

const pad = (n: number, width = 2) => String(Math.abs(n)).padStart(width, "0")

/**
 * Makes a script's `Date` work in a given time zone instead of the process's: local getters and
 * setters (also getYear/setYear), toString(), the local-time forms of the constructor and
 * Date.parse(), and the zone as default of toLocale…String(). It changes the Date of the script's
 * own context, which is new for every run, so Nexus and other plugins keep theirs. Not covered:
 * `Intl.DateTimeFormat` without a `timeZone` option and Dates made by structuredClone(), which use
 * the process's zone.
 */
export class ZonedDate {
  private readonly offsets: ZoneOffsets

  /** @throws RangeError for a zone the runtime doesn't know */
  constructor(zone: string) {
    this.offsets = new ZoneOffsets(zone)
  }

  /** patches the realm's Date and its prototype, and returns what the script gets as its global `Date` */
  install(RealmDate: DateConstructor): DateConstructor {
    // the context's own methods: they check that `this` is a Date and throw the context's TypeError,
    // and a subclass that overrides getTime() can't change what the patched methods see
    const { getTime, setTime } = RealmDate.prototype
    const time = (date: Date) => getTime.call(date)
    const set = (date: Date, value: number) => setTime.call(date, value)
    this.patchFields(RealmDate.prototype, time, set)
    this.patchText(RealmDate.prototype, time)
    Object.defineProperty(RealmDate, "parse", { value: this.parse, writable: true, configurable: true })
    const zoned = this.wrap(RealmDate)
    Object.defineProperty(RealmDate.prototype, "constructor", { value: zoned, writable: true, configurable: true })
    return zoned
  }

  /** Date.parse with local-time texts read in the zone */
  readonly parse = (text: unknown): number => {
    const string = String(text)
    if (DATE_ONLY.test(string) || ZONED.test(string)) return Date.parse(string)
    // read as UTC, the fields are the wall time meant, whatever zone the process runs in
    const wall = Date.parse(ISO_TIME.test(string) ? `${string}Z` : `${string} UTC`)
    return this.offsets.utc(wall)
  }

  private wrap(RealmDate: DateConstructor): DateConstructor {
    const zoned: DateConstructor = new Proxy(RealmDate, {
      construct: (target, args: unknown[], newTarget) => Reflect.construct(target, this.timeArguments(args), newTarget) as object,
      // Date() without new is the current time as text
      apply: () => new zoned().toString()
    })
    return zoned
  }

  // new Date(text) and new Date(year, month, …) are local times; a number or a Date is a moment
  private timeArguments(args: unknown[]): unknown[] {
    if (args.length === 1 && typeof args[0] === "string") return [this.parse(args[0])]
    if (args.length < 2) return args
    const [year, month, ...rest] = args.slice(0, 7).map(Number) as [number, number, ...number[]]
    return [this.offsets.utc(Date.UTC(year, month, ...rest))]
  }

  private patchFields(prototype: Date, time: (date: Date) => number, set: (date: Date, value: number) => number) {
    const offsets = this.offsets
    const target = prototype as unknown as Record<string, NumberMethod>
    for (const [local, utc] of Object.entries(GETTERS)) {
      target[local] = function () {
        return new Date(offsets.wall(time(this)))[utc]()
      }
    }
    for (const [local, utc] of Object.entries(SETTERS)) {
      target[local] = function (...args) {
        const now = time(this)
        // an invalid date gets a year (from 1970-01-01), but nothing else, as with the local zone
        const wall = new Date(Number.isNaN(now) && local === "setFullYear" ? 0 : offsets.wall(now))
        ;(wall[utc] as NumberMethod).apply(wall, args)
        return set(this, offsets.utc(wall.getTime()))
      }
    }
    // + 0 turns UTC's -0 into 0
    target.getTimezoneOffset = function () {
      return -offsets.offsetAt(time(this)) / 60_000 + 0
    }
    this.patchYear(target, set)
  }

  // the legacy two: years since 1900, and 0 to 99 meaning 1900 to 1999
  private patchYear(target: Record<string, NumberMethod>, set: (date: Date, value: number) => number) {
    const { getFullYear, setFullYear } = target as Record<"getFullYear" | "setFullYear", NumberMethod>
    target.getYear = function () {
      return getFullYear.call(this) - 1900
    }
    target.setYear = function (value) {
      const year = Math.trunc(Number(value))
      if (Number.isNaN(year)) return set(this, NaN)
      return setFullYear.call(this, year >= 0 && year <= 99 ? 1900 + year : year)
    }
  }

  private patchText(prototype: Date, time: (date: Date) => number) {
    const target = prototype as unknown as Record<string, TextMethod>
    const text = (format: (moment: number) => string): TextMethod => function () {
      const moment = time(this)
      return Number.isNaN(moment) ? "Invalid Date" : format(moment)
    }
    target.toString = text(moment => `${this.dateText(moment)} ${this.timeText(moment)}`)
    target.toDateString = text(moment => this.dateText(moment))
    target.toTimeString = text(moment => this.timeText(moment))
    const zone = this.offsets.zone
    for (const name of ["toLocaleString", "toLocaleDateString", "toLocaleTimeString"] as const) {
      const original = prototype[name] as TextMethod
      target[name] = function (locales, options) {
        // null throws there as it would without the zone; an explicit `timeZone: undefined` means the default
        if (options === null || (options !== undefined && typeof options !== "object")) return original.call(this, locales, options)
        const given = options as { timeZone?: unknown } | undefined
        return original.call(this, locales, { ...given, timeZone: given?.timeZone ?? zone })
      }
    }
  }

  // "Thu Oct 29 2026", as Date.prototype.toDateString writes it
  private dateText(moment: number) {
    const wall = new Date(this.offsets.wall(moment))
    const year = wall.getUTCFullYear()
    return `${DAYS[wall.getUTCDay()]} ${MONTHS[wall.getUTCMonth()]} ${pad(wall.getUTCDate())} ${year < 0 ? "-" : ""}${pad(year, 4)}`
  }

  // "01:09:00 GMT+0100 (Central European Standard Time)"
  private timeText(moment: number) {
    const wall = new Date(this.offsets.wall(moment))
    const minutes = Math.round(this.offsets.offsetAt(moment) / 60_000)
    const offset = `${minutes < 0 ? "-" : "+"}${pad(Math.trunc(minutes / 60))}${pad(minutes % 60)}`
    return `${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}:${pad(wall.getUTCSeconds())} GMT${offset} (${this.offsets.name(moment)})`
  }
}
