import type { Value } from "@lox-nexus/plugin-sdk/values"

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/
const SECONDS_PER_DAY = 86_400

/**
 * A date, a time of day, or both, read from what Loxone sends: text "YYYY-MM-DD HH:MM:SS" (or
 * with a T, or only the date, or only the time, seconds optional), or a number of seconds since
 * midnight. Written the way Home Assistant's services take them ("YYYY-MM-DD", "HH:MM:SS").
 */
export class DateTimeParts {
  private constructor(readonly date: string | undefined, readonly time: string | undefined) {}

  /**
   * undefined for empty text, which a Loxone text output sends before it has a value
   * @throws Error for any other text or value that isn't a date or time
   */
  static of(value: Value): DateTimeParts | undefined {
    if (value.type === "number") return DateTimeParts.fromSeconds(value.value)
    if (value.type !== "string") throw new Error(`expects text like "2026-10-28 06:30:00" or seconds since midnight, not ${value.type}`)
    const text = value.value.trim()
    if (text === "") return undefined
    const [first = "", second, ...rest] = text.split(/[ T]/)
    if (rest.length === 0 && second !== undefined) return new DateTimeParts(DateTimeParts.date(first, text), DateTimeParts.time(second, text))
    if (rest.length === 0 && DATE.test(first)) return new DateTimeParts(DateTimeParts.date(first, text), undefined)
    if (rest.length === 0) return new DateTimeParts(undefined, DateTimeParts.time(first, text))
    throw DateTimeParts.invalid(text)
  }

  /** "YYYY-MM-DD HH:MM:SS"; undefined unless both parts are there */
  get dateTime() {
    return this.date !== undefined && this.time !== undefined ? `${this.date} ${this.time}` : undefined
  }

  private static fromSeconds(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds >= SECONDS_PER_DAY) {
      throw new Error(`a time of day is 0 to 86399 seconds since midnight, not ${seconds}`)
    }
    const whole = Math.floor(seconds)
    return new DateTimeParts(undefined, DateTimeParts.clock(Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60))
  }

  private static date(text: string, whole: string) {
    const [, year, month, day] = DATE.exec(text) ?? []
    if (!year || Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) throw DateTimeParts.invalid(whole)
    return `${year}-${month}-${day}`
  }

  private static time(text: string, whole: string) {
    const [, hours, minutes, seconds = "0"] = TIME.exec(text) ?? []
    if (!hours || Number(hours) > 23 || Number(minutes) > 59 || Number(seconds) > 59) throw DateTimeParts.invalid(whole)
    return DateTimeParts.clock(Number(hours), Number(minutes), Number(seconds))
  }

  private static clock(hours: number, minutes: number, seconds: number) {
    return [hours, minutes, seconds].map(part => String(part).padStart(2, "0")).join(":")
  }

  private static invalid(text: string) {
    return new Error(`"${text}" is not a date or time like "2026-10-28 06:30:00", "2026-10-28" or "06:30"`)
  }
}
