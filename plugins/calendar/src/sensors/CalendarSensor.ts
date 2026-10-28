import { Sensor } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { CalendarPlugin } from "../CalendarPlugin.ts"
import { EventFilter } from "../filter/EventFilter.ts"
import type { Filter } from "../filter/FilterParams.ts"
import type { Occurrence } from "../ics/Occurrence.ts"

/**
 * A sensor that follows the agenda through its filter. It re-evaluates after every read of the
 * calendar, after every dismissal, and exactly when one of its occurrences becomes active or
 * stops being active: one timer, set to the next such moment, instead of polling.
 *
 * Before the calendar was read once it sends nothing, so a restart with the feed unreachable
 * doesn't switch Loxone outputs off.
 */
export abstract class CalendarSensor<Params extends Filter> extends Sensor<CalendarPlugin, Params> {
  /**
   * Timers run on a monotonic clock, so a step of the wall clock (a Raspberry Pi without RTC
   * syncing NTP after boot) would move every transition; re-checking at least this often bounds
   * the error. A check that finds nothing changed costs nothing on the bus.
   */
  static readonly MAX_WAIT_MS = 15 * 60_000
  protected readonly filter = new EventFilter(this.params)
  private cancelTimer: (() => void) | undefined
  private last: Value | undefined

  override start() {
    if (this.showsCurrent) this.own(this.plugin.shown.add(this.filter))
    this.listen(this.plugin.agenda, "changed", () => this.evaluate())
    this.evaluate()
  }

  /** whether the sensor shows active occurrences, which `dismiss` then hides (see ShownFilters) */
  protected get showsCurrent() {
    return true
  }

  /**
   * Sends what the occurrences mean for this sensor now.
   * @param occurrences the ones that aren't dismissed, sorted by start
   */
  protected abstract update(occurrences: Occurrence[], now: number): void

  // re-checks and reads that change nothing send nothing, so Loxone sees one value per transition
  protected override emit(value: Value) {
    if (this.last !== undefined && Value.equals(this.last, value)) return
    this.last = value
    super.emit(value)
  }

  /** when to evaluate again; by default when an occurrence becomes active or ends */
  protected nextUpdate(occurrences: Occurrence[], now: number): number | undefined {
    return this.filter.nextChange(occurrences, now)
  }

  private evaluate() {
    this.cancelTimer?.()
    this.cancelTimer = undefined
    const agenda = this.plugin.agenda
    if (!agenda.loaded) return
    const now = this.clock.now()
    try {
      this.update(agenda.visible, now)
      const at = this.nextUpdate(agenda.visible, now)
      // a timer that fires a little early finds nothing changed and sets itself for the rest
      if (at !== undefined) this.cancelTimer = this.after(Math.min(at - now, CalendarSensor.MAX_WAIT_MS), () => this.evaluate())
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.plugin.log.error(`the ${(this.constructor as { id?: string }).id} sensor failed`, { params: this.params, error: message })
      this.last = undefined // the next value clears the failure, so it must go out
      this.fail(message)
    }
  }
}
