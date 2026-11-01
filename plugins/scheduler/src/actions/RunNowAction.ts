import { Action, z } from "@lox-nexus/plugin-sdk"
import type { SchedulerPlugin } from "../SchedulerPlugin.ts"
import { scheduleField } from "./ScheduleInput.ts"

const input = z.object({ schedule: scheduleField })

/** Fires a schedule once now, as a test: sends its value or pulse, or opens its window until its end. */
export class RunNowAction extends Action<SchedulerPlugin, z.infer<typeof input>> {
  static readonly id = "run-now"
  static readonly label = "Run now"
  static readonly description = "Runs this schedule once now, as a test: sends its value or pulse, or opens its window until its end"
  static readonly input = input
  static readonly placement = "panel"

  run() {
    const schedule = this.plugin.schedules.get(this.input.schedule)
    if (!schedule) throw new Error("the schedule isn't running any more")
    const message = schedule.runNow(this.plugin.clock.now())
    this.plugin.log.info(`ran "${schedule.name}" from the panel`)
    this.plugin.panelChanged()
    return message
  }
}
