import { signalGroup, timeOfDay, z } from "@lox-nexus/plugin-sdk"
import { CronExpression } from "../cron/CronExpression.ts"
import { Weekdays, type Weekday } from "./Weekdays.ts"

/** When a schedule runs: a time of day on chosen weekdays, or a cron expression. */
export type Trigger = { trigger: "time"; time: string; weekdays: Weekday[] } | { trigger: "cron"; cron: string }

/** What every schedule has besides its trigger. */
export interface Common {
  group: string
  /** absent for next-run sensors, which can't match another schedule's offsets anyway */
  randomMinutes?: number
}

/** The random offset is bounded so that an occurrence stays near its time and windows stay ordered. */
export const MAX_RANDOM_MINUTES = 120

/**
 * The params every schedule shares, and the trigger choice of the ones that run at single
 * moments (values, pulses, next run). Cron expressions are checked when the signal is saved, with
 * the parser's message.
 */
export class TriggerParams {
  static readonly group = {
    group: signalGroup(z.string().trim().max(100).default("").meta({
      title: "Group",
      description: "A name such as \"presence\": the Enabled and Skip next actuators of that group switch all its schedules. Empty: none"
    }))
  }

  static readonly common = {
    ...TriggerParams.group,
    randomMinutes: z.int().min(0).max(MAX_RANDOM_MINUTES).default(0).meta({
      title: "Random offset (± minutes)",
      description: "Moves each run by a random time up to this many minutes earlier or later, e.g. to simulate presence. 0: exact"
    })
  }

  /** a cron expression field, refused with the parser's message when invalid */
  static cron(title: string, description: string) {
    return z.string().trim().min(1, "enter a cron expression").max(200).superRefine((text, context) => {
      const problem = CronExpression.problem(text)
      if (problem) context.addIssue({ code: "custom", message: problem })
    }).meta({ title, description })
  }

  /** the trigger choice plus the group, the random offset and `extra` fields, in both branches */
  static schema<Extra extends z.ZodRawShape>(extra: Extra) {
    return TriggerParams.choice({ ...TriggerParams.common, ...extra })
  }

  /** the trigger choice plus `fields`, in both branches */
  static choice<Fields extends z.ZodRawShape>(fields: Fields) {
    return z.discriminatedUnion("trigger", [
      z.object({
        trigger: z.literal("time").meta({ title: "Time and weekdays" }),
        time: timeOfDay().meta({ title: "Time", description: "When it runs, e.g. 06:30, in the instance's time zone" }),
        weekdays: Weekdays.schema("The days it runs on"),
        ...fields
      }),
      z.object({
        trigger: z.literal("cron").meta({ title: "Cron expression" }),
        cron: TriggerParams.cron("Cron expression", "minute hour day-of-month month day-of-week, e.g. \"0 7 * * MON-FRI\" or \"*/15 6-22 * * *\""),
        ...fields
      })
    ])
  }

  /** the trigger as a cron expression: a time of day on weekdays is "MM HH * * days" */
  static expression(trigger: Trigger): CronExpression {
    if (trigger.trigger === "cron") return CronExpression.parse(trigger.cron)
    return CronExpression.parse(`${TriggerParams.timeField(trigger.time)} * * ${Weekdays.cronField(trigger.weekdays)}`)
  }

  /** "MM HH" of a cron expression from "HH:MM" */
  static timeField(time: string) {
    const [hour = "0", minute = "0"] = time.split(":")
    return `${Number(minute)} ${Number(hour)}`
  }

  /** "06:30 Mon–Fri" or "cron 0 7 * * *", with "± 15 min" when randomised */
  static describe(trigger: Trigger, randomMinutes = 0) {
    const text = trigger.trigger === "cron" ? `cron ${trigger.cron}` : `${trigger.time} ${Weekdays.describe(trigger.weekdays)}`
    return randomMinutes > 0 ? `${text} ± ${randomMinutes} min` : text
  }
}
