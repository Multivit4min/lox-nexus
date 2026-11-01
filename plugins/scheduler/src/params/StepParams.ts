import { timeOfDay, z } from "@lox-nexus/plugin-sdk"
import { CronExpression } from "../cron/CronExpression.ts"
import { TriggerParams, type Common, type Trigger } from "./TriggerParams.ts"
import { Weekdays } from "./Weekdays.ts"

/** One step of a value schedule: when, and the value it sends from then on. */
export type Step<V> = Trigger & { value: V }

/** A value schedule's params: its steps, its group and its random offset. */
export type StepsSpec<V> = Common & { steps: Step<V>[] }

/**
 * The params of the value sensors: a list of steps, each with its own trigger (a time of day on
 * weekdays, or a cron expression) and the value it sends, e.g. 07:00 Mon–Fri → 21 and
 * 22:00 daily → 18. Cron expressions and weekdays are checked in the list, so a message names the
 * step ("step 2: the minute field has 61; …").
 */
export class StepParams {
  static readonly MAX_STEPS = 50
  /** a summary longer than this shows its first step and how many there are */
  static readonly SUMMARY_LENGTH = 80

  static schema<V extends z.ZodType>(value: V) {
    const step = z.discriminatedUnion("trigger", [
      z.object({
        trigger: z.literal("time").meta({ title: "Time and weekdays" }),
        time: timeOfDay().meta({ title: "Time", description: "When this step starts, e.g. 07:00, in the instance's time zone" }),
        weekdays: Weekdays.schema("The days this step starts on", false),
        value
      }),
      z.object({
        trigger: z.literal("cron").meta({ title: "Cron expression" }),
        cron: z.string().trim().max(200).meta({ title: "Cron expression", description: "minute hour day-of-month month day-of-week, e.g. \"0 7 * * MON-FRI\"" }),
        value
      })
    ])
    return z.object({
      steps: z.array(step).min(1, "add at least one step").max(StepParams.MAX_STEPS).superRefine((steps, context) => {
        steps.forEach((step, index) => {
          const problem = StepParams.problem(step)
          if (problem) context.addIssue({ code: "custom", path: [index, problem.field], message: `step ${index + 1}: ${problem.message}` })
        })
      }).meta({
        title: "Steps",
        description: "Each step sends its value from its time on, until the next step. With one step the value reaches Loxone only once, since an unchanged value isn't sent again"
      }),
      ...TriggerParams.common
    })
  }

  /** "07:00 Mon–Fri → 21; 22:00 daily → 18", shortened when long, with "± 10 min" when randomised */
  static describe<V>(steps: readonly Step<V>[], format: (value: V) => string, randomMinutes = 0) {
    const parts = steps.map(step => `${TriggerParams.describe(step)} → ${format(step.value)}`)
    let text = parts.join("; ")
    if (text.length > StepParams.SUMMARY_LENGTH && parts.length > 1) text = `${parts[0]}; … (${parts.length} steps)`
    return randomMinutes > 0 ? `${text} ± ${randomMinutes} min` : text
  }

  private static problem(step: Trigger): { field: string; message: string } | undefined {
    if (step.trigger === "time") return step.weekdays.length === 0 ? { field: "weekdays", message: "choose at least one weekday" } : undefined
    const message = step.cron === "" ? "enter a cron expression" : CronExpression.problem(step.cron)
    return message ? { field: "cron", message } : undefined
  }
}
