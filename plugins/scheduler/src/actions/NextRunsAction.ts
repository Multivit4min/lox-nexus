import { Action, timeOfDay, z } from "@lox-nexus/plugin-sdk"
import { CronSchedule } from "../cron/CronSchedule.ts"
import { TriggerParams } from "../params/TriggerParams.ts"
import { Weekdays } from "../params/Weekdays.ts"
import { Jitter } from "../schedule/Jitter.ts"
import { MergedSchedule } from "../schedule/MergedSchedule.ts"
import { Timeline } from "../schedule/Timeline.ts"
import type { SchedulerPlugin } from "../SchedulerPlugin.ts"
import { scheduleField } from "./ScheduleInput.ts"

const input = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("cron").meta({ title: "A cron expression" }),
    cron: TriggerParams.cron("Cron expression", "e.g. \"0 7 * * MON-FRI\"")
  }),
  z.object({
    source: z.literal("time").meta({ title: "A time and weekdays" }),
    time: timeOfDay().meta({ title: "Time" }),
    weekdays: Weekdays.schema("The days it runs on")
  }),
  z.object({ source: z.literal("schedule").meta({ title: "A schedule of this instance" }), schedule: scheduleField })
])

/**
 * Lists the next runs of a schedule, or of a cron expression or time to try out, in the
 * instance's time zone: a quick check of what an expression means, DST included.
 */
export class NextRunsAction extends Action<SchedulerPlugin, z.infer<typeof input>> {
  static readonly id = "next-runs"
  static readonly label = "Next runs"
  static readonly description = "Lists the next 10 runs of a schedule, a cron expression or a time, in the instance's time zone"
  static readonly input = input
  static readonly COUNT = 10

  run() {
    const now = this.plugin.clock.now()
    const zone = this.plugin.zone
    const { input } = this
    let title: string
    let lines: string[]
    if (input.source === "schedule") {
      const schedule = this.plugin.schedules.get(input.schedule)
      if (!schedule) throw new Error("the schedule isn't running any more")
      title = `"${schedule.name}" (${schedule.summary})`
      lines = schedule.upcoming(now, NextRunsAction.COUNT)
    } else {
      const trigger = input.source === "cron" ? { trigger: "cron" as const, cron: input.cron } : { trigger: "time" as const, time: input.time, weekdays: input.weekdays }
      title = TriggerParams.describe(trigger, 0)
      const timeline = new Timeline(new MergedSchedule([new CronSchedule(TriggerParams.expression(trigger), zone)]), Jitter.NONE)
      lines = timeline.upcoming(now, NextRunsAction.COUNT).map(occurrence => zone.dateTime(occurrence.at))
    }
    if (lines.length === 0) return `${title} doesn't run again`
    return [`Next runs of ${title} in ${zone.id}:`, ...lines].join("\n")
  }
}
