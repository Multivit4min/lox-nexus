import { TriggerParams, type Common, type Trigger } from "../params/TriggerParams.ts"
import type { NextChange } from "../schedule/ScheduleView.ts"
import { ScheduleSensor } from "./ScheduleSensor.ts"

/** A schedule of single moments (a time of day on weekdays, or a cron expression), as opposed to a window. */
export abstract class PointSchedule<Params extends Trigger & Common> extends ScheduleSensor<Params> {
  readonly summary = TriggerParams.describe(this.params, this.params.randomMinutes)
  protected readonly occurrences = this.timeline(TriggerParams.expression(this.params))

  /** how long a skip is kept after its occurrence */
  protected abstract readonly skipKeptMs: number

  /** only windows are on or off */
  isOn(): undefined {
    return undefined
  }

  skipping(now: number) {
    const next = this.occurrences.next(now)
    return next !== undefined && this.plugin.skips.skips(this.key, next.raw)
  }

  next(now: number): NextChange | undefined {
    if (!this.enabled) return undefined
    const next = this.nextRunning(this.occurrences, now)
    return next && { at: next.at }
  }

  upcoming(now: number, count: number) {
    return this.occurrences.upcoming(now, count).map(occurrence => this.line(occurrence))
  }

  skipNext(now: number) {
    const next = this.occurrences.next(now)
    if (!next) throw new Error(`"${this.name}" has no next run to skip`)
    return this.plugin.skips.add(this.key, { raw: next.raw, until: next.at + this.skipKeptMs })
  }
}
