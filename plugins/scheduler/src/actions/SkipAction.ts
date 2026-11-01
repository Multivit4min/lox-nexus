import { Action, z } from "@lox-nexus/plugin-sdk"
import type { SchedulerPlugin } from "../SchedulerPlugin.ts"
import { scheduleField } from "./ScheduleInput.ts"

const input = z.object({ schedule: scheduleField, skip: z.boolean().default(true).meta({ title: "Skip" }) })

/** The panel's Skip next and Don't skip buttons: skips the next run of one schedule, or takes the skip back. */
export class SkipAction extends Action<SchedulerPlugin, z.infer<typeof input>> {
  static readonly id = "skip"
  static readonly label = "Skip next run"
  static readonly description = "Skips the next run of this schedule, or runs it again after all"
  static readonly input = input
  static readonly placement = "panel"

  run() {
    const schedule = this.plugin.schedules.get(this.input.schedule)
    if (!schedule) throw new Error("the schedule isn't running any more")
    const now = this.plugin.clock.now()
    if (!this.input.skip) {
      if (!schedule.cancelSkip()) return `"${schedule.name}" wasn't skipping a run`
      this.plugin.log.info(`"${schedule.name}" runs its next run after all, from the panel`)
      return `"${schedule.name}" runs its next run after all`
    }
    if (!schedule.skipNext(now)) return `"${schedule.name}" already skips its next run`
    this.plugin.log.info(`skipping the next run of "${schedule.name}", from the panel`)
    return `"${schedule.name}" skips its next run`
  }
}
