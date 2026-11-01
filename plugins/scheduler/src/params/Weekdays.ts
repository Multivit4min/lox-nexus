import { z } from "@lox-nexus/plugin-sdk"

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const
const LABELS = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" } as const
const CRON_DAY = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 } as const

export type Weekday = typeof DAYS[number]

/** The weekdays of a time-of-day trigger: a multiple choice, shown as chips to toggle. */
export class Weekdays {
  static readonly ALL: readonly Weekday[] = DAYS
  static readonly WORKDAYS: readonly Weekday[] = DAYS.slice(0, 5)

  /** @param checked whether an empty choice is refused here; steps check it in their list, to name the step */
  static schema(description: string, checked = true) {
    const days = z.array(z.enum(DAYS).meta({ enumLabels: LABELS }))
    return (checked ? days.min(1, "choose at least one weekday") : days)
      .default([...DAYS])
      .meta({ title: "Weekdays", description })
  }

  /** the day-of-week field of a cron expression: "1,2,3" */
  static cronField(days: readonly Weekday[]) {
    return [...new Set(days.map(day => CRON_DAY[day]))].sort((a, b) => a - b).join(",")
  }

  /** "daily", "Mon–Fri", "Sat, Sun" or "Mon, Wed, Fri", in week order */
  static describe(days: readonly Weekday[]) {
    const chosen = DAYS.filter(day => days.includes(day))
    if (chosen.length === DAYS.length) return "daily"
    const first = DAYS.indexOf(chosen[0] ?? "mon")
    const consecutive = chosen.every((day, index) => DAYS.indexOf(day) === first + index)
    if (consecutive && chosen.length > 2) return `${LABELS[chosen[0] ?? "mon"]}–${LABELS[chosen.at(-1) ?? "sun"]}`
    return chosen.map(day => LABELS[day]).join(", ")
  }
}
