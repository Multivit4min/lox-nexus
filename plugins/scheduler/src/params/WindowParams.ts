import { timeOfDay, z } from "@lox-nexus/plugin-sdk"
import { CronExpression } from "../cron/CronExpression.ts"
import { TriggerParams, type Common } from "./TriggerParams.ts"
import { Weekdays, type Weekday } from "./Weekdays.ts"

/** When a window opens and closes: times of day, or two cron expressions. */
export type WindowTrigger =
  | { trigger: "time"; start: string; end: string; weekdays: Weekday[] }
  | { trigger: "cron"; startCron: string; endCron: string }

export type WindowSpec = WindowTrigger & Common

const timeBranch = z.object({
  trigger: z.literal("time").meta({ title: "Times and weekdays" }),
  start: timeOfDay().meta({ title: "On at", description: "When the window opens, e.g. 22:00" }),
  end: timeOfDay().meta({ title: "Off at", description: "When it closes, e.g. 06:00; earlier than the start means the next day" }),
  weekdays: Weekdays.schema("The days the window opens on; one opened on Friday at 22:00 closes on Saturday"),
  ...TriggerParams.common
})
  .refine(window => window.start !== window.end, { message: "the window opens and closes at the same time", path: ["end"] })
  .refine(window => WindowParams.longEnough(window), {
    message: "the window is too short for its random offset: it must last more than twice the offset, and leave more than that off", path: ["randomMinutes"]
  })

const cronBranch = z.object({
  trigger: z.literal("cron").meta({ title: "Cron expressions" }),
  startCron: TriggerParams.cron("On (cron)", "When the window opens, e.g. \"0 22 * * MON-FRI\""),
  endCron: TriggerParams.cron("Off (cron)", "When it closes, e.g. \"0 6 * * *\""),
  ...TriggerParams.common
}).refine(window => WindowParams.normalize(window.startCron) !== WindowParams.normalize(window.endCron), {
  message: "the window opens and closes at the same times", path: ["endCron"]
})

/**
 * A window's params. It is on from a start until the next end, and works that out from the clock
 * at any moment (on if the latest start is later than the latest end), so it is right after a restart.
 */
export class WindowParams {
  static readonly schema = z.discriminatedUnion("trigger", [timeBranch, cronBranch])

  /** start and end as cron expressions; a time-of-day end closes every day, after whichever start */
  static expressions(window: WindowTrigger): { start: CronExpression; end: CronExpression } {
    if (window.trigger === "cron") return { start: CronExpression.parse(window.startCron), end: CronExpression.parse(window.endCron) }
    return {
      start: CronExpression.parse(`${TriggerParams.timeField(window.start)} * * ${Weekdays.cronField(window.weekdays)}`),
      end: CronExpression.parse(`${TriggerParams.timeField(window.end)} * * *`)
    }
  }

  /** "22:00–06:00 daily" or "cron 0 22 * * * – 0 6 * * *" */
  static describe(window: WindowSpec) {
    const text = window.trigger === "cron"
      ? `cron ${window.startCron} – ${window.endCron}`
      : `${window.start}–${window.end} ${Weekdays.describe(window.weekdays)}`
    const random = window.randomMinutes ?? 0
    return random > 0 ? `${text} ± ${random} min` : text
  }

  /**
   * Whether a time-of-day window keeps its shape with its offset: on and off must each last more
   * than twice the offset. Offsets never reorder starts and ends (see Timeline), but they would be
   * cut short so much that the offset would mean little. Cron windows have no fixed length.
   */
  static longEnough(window: { start: string; end: string; randomMinutes: number }) {
    const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
    const length = (minutes(window.end) - minutes(window.start) + 1440) % 1440
    return Math.min(length, 1440 - length) > 2 * window.randomMinutes
  }

  /** for comparing expressions written differently: "0  22 * * *" and "0 22 * * *" are the same */
  static normalize(cron: string) {
    return cron.trim().replace(/\s+/g, " ").toLowerCase()
  }
}
