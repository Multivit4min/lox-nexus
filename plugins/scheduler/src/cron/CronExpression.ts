import { CronField, type CronFieldSpec } from "./CronField.ts"

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
const named = (names: string[], first: number) => Object.fromEntries(names.map((name, index) => [name, index + first]))

const SPECS: readonly CronFieldSpec[] = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "day of month", min: 1, max: 31 },
  { name: "month", min: 1, max: 12, names: named(MONTHS, 1) },
  // 0 and 7 are both Sunday
  { name: "day of week", min: 0, max: 7, names: named(WEEKDAYS, 0), endNames: { sun: 7 } }
]

/** the longest each month can be, for telling expressions that never match (30 February) */
const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

const MACROS: Readonly<Record<string, string>> = {
  "@yearly": "0 0 1 1 *", "@annually": "0 0 1 1 *", "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0", "@daily": "0 0 * * *", "@midnight": "0 0 * * *", "@hourly": "0 * * * *"
}

/**
 * A 5-field cron expression (minute hour day-of-month month day-of-week) as Vixie cron reads it:
 * lists, ranges, steps, month and weekday names, `@daily` and the other macros. When both day of
 * month and day of week are restricted (neither starts with `*`), a day matches if **either**
 * does: `0 8 13 * FRI` runs on every 13th and every Friday.
 *
 * It only says which wall-clock times match; CronSchedule finds them in a time zone.
 */
export class CronExpression {
  readonly minutes: readonly number[]
  readonly hours: readonly number[]
  private readonly days: CronField
  private readonly months: CronField
  private readonly weekdays: ReadonlySet<number>
  private readonly weekdayStar: boolean

  /**
   * whether the hour field is a bare `*`: such schedules (hourly, every few minutes) follow real
   * time across DST changes instead of the wall clock, see CronSchedule
   */
  readonly everyHour: boolean

  private constructor(readonly source: string, fields: CronField[], hourText: string) {
    const [minutes, hours, days, months, weekdays] = fields as [CronField, CronField, CronField, CronField, CronField]
    this.minutes = minutes.values
    this.hours = hours.values
    this.days = days
    this.months = months
    this.weekdays = new Set(weekdays.values.map(day => day % 7))
    this.weekdayStar = weekdays.star
    this.everyHour = hourText === "*"
  }

  /** @throws Error naming the field and what is wrong with it */
  static parse(text: string): CronExpression {
    const source = text.trim().replace(/\s+/g, " ")
    const expanded = source.startsWith("@") ? MACROS[source.toLowerCase()] : source
    if (expanded === undefined) throw new Error(`"${source}" isn't a known macro; use ${Object.keys(MACROS).join(", ")}`)
    const texts = expanded.split(" ")
    if (texts.length !== 5) {
      throw new Error(`a cron expression has 5 fields (minute hour day-of-month month day-of-week), "${source}" has ${expanded === "" ? 0 : texts.length}`)
    }
    const fields = texts.map((field, index) => CronField.parse(field, SPECS[index] as CronFieldSpec))
    const expression = new CronExpression(source, fields, texts[1] ?? "")
    if (!expression.matchesSomeDate()) throw new Error(`"${source}" never runs: no month has that day (like 30 February)`)
    return expression
  }

  /** what is wrong with an expression, or undefined if it is valid; for settings checks */
  static problem(text: string): string | undefined {
    try {
      CronExpression.parse(text)
      return undefined
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }

  /**
   * whether the expression runs on a date
   * @param month 1 to 12
   * @param weekday 0 (Sunday) to 6
   */
  matchesDate(month: number, day: number, weekday: number) {
    if (!this.months.has(month)) return false
    const byDay = this.days.has(day)
    const byWeekday = this.weekdays.has(weekday)
    // Vixie cron: either restricted field matching is enough when both are restricted
    if (!this.days.star && !this.weekdayStar) return byDay || byWeekday
    return byDay && byWeekday
  }

  private matchesSomeDate() {
    // a restricted weekday occurs in every month, and with a starred day of month the weekday decides
    if (!this.weekdayStar || this.days.star) return this.weekdays.size > 0
    const firstDay = this.days.values[0] ?? 32
    return this.months.values.some(month => firstDay <= (MONTH_DAYS[month - 1] ?? 0))
  }
}
