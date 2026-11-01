import { Actuator, type ActuatorCommand } from "@lox-nexus/plugin-sdk"
import type { ValueOf } from "@lox-nexus/plugin-sdk/values"
import { targetName, targetParams, type Target } from "../params/TargetParams.ts"
import type { SchedulerPlugin } from "../SchedulerPlugin.ts"

/**
 * On true, skips the next run of each schedule of a group (or of all): a window open now closes
 * and stays closed until its end. Kept in the store, so a restart doesn't run a skipped run. A
 * second true while the run is still skipped does nothing; false does nothing, so a Loxone pulse
 * acts once. A value the host replays after a start is ignored, or a restart would skip another
 * run.
 */
export class SkipNextActuator extends Actuator<SchedulerPlugin, Target, ValueOf<"boolean">> {
  static readonly id = "skip-next"
  static readonly label = "Skip next run"
  static readonly description = "On true, skips the next run of the schedules of a group, or of all of them"
  static readonly params = targetParams
  static readonly accepts = "boolean"

  run(value: ValueOf<"boolean">, command?: ActuatorCommand) {
    if (command?.replayed || !value.value) return
    const now = this.clock.now()
    const schedules = this.plugin.schedules.targeted(this.params.group)
    const skipped: string[] = []
    // the schedules are told once, not once per skip
    this.plugin.batch(() => {
      for (const schedule of schedules) {
        try {
          if (schedule.skipNext(now)) skipped.push(schedule.name)
        } catch (error) {
          this.plugin.log.info(error instanceof Error ? error.message : String(error))
        }
      }
    })
    const target = targetName(this.params.group)
    if (skipped.length === 0) return this.plugin.log.info(`nothing new to skip in ${target}`)
    this.plugin.log.info(`skipping the next run of ${skipped.map(name => `"${name}"`).join(", ")}, asked by signal "${this.signal.label}"`)
  }
}
