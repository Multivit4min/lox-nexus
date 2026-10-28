import { z } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { FilterParams } from "../filter/FilterParams.ts"
import type { Occurrence } from "../ics/Occurrence.ts"
import { TimeFormat } from "../time/TimeFormat.ts"
import { CalendarSensor } from "./CalendarSensor.ts"

const timeParams = FilterParams.schema({
  which: z.enum(["currentStart", "currentEnd", "nextStart", "nextEnd"]).default("nextStart")
    .describe("The start or end of the current (active) or the next matching event"),
  format: z.enum(["minutesUntil", "unix", "loxone"]).default("minutesUntil")
    .describe("minutesUntil: whole minutes from now (negative once passed, 1000000 without an event); "
      + "unix: seconds since 1970 (0 without an event); loxone: seconds since 2009-01-01 local time (0 without an event)")
})

/**
 * The start or end of the current or next matching occurrence. The times are the event's own,
 * without lead or lag. See TimeFormat for what is sent without an event.
 */
export class TimeSensor extends CalendarSensor<z.output<typeof timeParams>> {
  static readonly id = "time"
  static readonly label = "Event time"
  static readonly description = "When the current or next matching event starts or ends"
  static readonly params = timeParams
  static readonly valueType = "number"

  private readonly format = new TimeFormat(this.params.format, this.plugin.zone)

  protected override get showsCurrent() {
    return this.params.which.startsWith("current")
  }

  protected update(occurrences: Occurrence[], now: number) {
    this.emit(Value.number(this.format.value(this.instant(occurrences, now), now)))
  }

  // minutesUntil counts down, so besides activations it changes every minute
  protected override nextUpdate(occurrences: Occurrence[], now: number) {
    const transition = super.nextUpdate(occurrences, now)
    const tick = this.format.nextChange(this.instant(occurrences, now), now)
    if (transition === undefined || tick === undefined) return transition ?? tick
    return Math.min(transition, tick)
  }

  private instant(occurrences: Occurrence[], now: number) {
    const { which } = this.params
    const occurrence = which.startsWith("current") ? this.filter.current(occurrences, now) : this.filter.next(occurrences, now)
    if (!occurrence) return undefined
    return which.endsWith("Start") ? occurrence.start : occurrence.end
  }
}
