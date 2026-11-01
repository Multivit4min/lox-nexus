import type { Common, Trigger } from "../params/TriggerParams.ts"
import type { Occurrence } from "../schedule/Timeline.ts"
import { PointSchedule } from "./PointSchedule.ts"
import { ScheduleSensor } from "./ScheduleSensor.ts"

/**
 * A schedule that does something at single moments: a pulse.
 *
 * Missed runs: a run that passed while Nexus was down is skipped, except one at most GRACE_MS
 * ago when the sensor starts, which runs once then. Never one that was already dealt with: the
 * sensor persists how far it got (RunLog.handled) when a run is run, skipped, switched off or
 * missed, and when it stops, so a run that was off at its time, or one that passed before an edit
 * of the schedule, doesn't run late. A schedule just added doesn't run for a time already past.
 *
 * Clock steps: a run the clock jumped over is run if at most GRACE_MS late, else logged as
 * missed. A step back by more than GRACE_MS restarts the bookkeeping from the new time (with a
 * warning) instead of waiting for the old time to come round again.
 */
export abstract class TriggerSensor<Params extends Trigger & Common> extends PointSchedule<Params> {
  // as long as a restart could still run it late
  protected readonly skipKeptMs = ScheduleSensor.GRACE_MS
  /** runs up to here are handled (run, skipped, off or missed) */
  private cursor = 0

  /** does what the schedule is for */
  protected abstract fire(): void

  protected override begin(now: number) {
    const before = this.plugin.runs.started(this.key, now)
    this.onDispose(() => this.plugin.runs.handled(this.key, this.cursor))
    if (!before) {
      this.cursor = now
      return
    }
    const stored = before.handled ?? before.ran ?? before.seen
    // a time after now was written before the clock was set back: start from now instead
    if (stored > now) this.plugin.log.warn(`schedule "${this.name}" last ran after the current time; the clock was set back`)
    const handled = Math.min(stored, now)
    this.cursor = Math.max(now - ScheduleSensor.GRACE_MS, handled)
    const missed = this.occurrences.previous(now - ScheduleSensor.GRACE_MS)
    if (missed && missed.at > handled) {
      this.plugin.log.info(`schedule "${this.name}" missed its run at ${this.plugin.zone.dateTime(missed.at)} while stopped`)
    }
  }

  protected evaluate(now: number) {
    const due = this.occurrences.previous(now)
    if (due && due.at > this.cursor) this.handle(due, now)
    this.cursor = Math.max(this.cursor, now)
    return this.occurrences.next(this.cursor)?.at
  }

  // runs from the new time on happen again, rather than waiting until the old time comes round
  protected override clockWentBack(now: number) {
    this.cursor = now
    this.plugin.runs.handled(this.key, now)
  }

  private handle(due: Occurrence, now: number) {
    const when = this.plugin.zone.dateTime(due.at)
    if (now - due.at > ScheduleSensor.GRACE_MS) {
      this.plugin.log.warn(`schedule "${this.name}" missed its run at ${when}: the clock jumped past it`)
    } else if (!this.enabled) {
      this.plugin.log.debug(`schedule "${this.name}" didn't run at ${when}: ${this.offReason()}`)
    } else if (this.plugin.skips.skips(this.key, due.raw)) {
      this.plugin.log.info(`schedule "${this.name}" skipped its run at ${when}`)
      this.plugin.panelChanged()
    } else {
      return this.run(now)
    }
    this.plugin.runs.handled(this.key, due.at)
  }

  private run(now: number) {
    this.fire()
    this.plugin.runs.ran(this.key, now)
    this.plugin.panelChanged()
  }

  runNow(now: number) {
    const off = this.offReason()
    if (off) throw new Error(`"${this.name}" doesn't run while ${off}`)
    this.run(now)
    return `Ran "${this.name}"`
  }
}
