import type { DisposableLike } from "@lox-nexus/plugin-sdk"
import type { Occurrence } from "../ics/Occurrence.ts"
import type { EventFilter } from "./EventFilter.ts"

/**
 * The filters of the instance's sensors that show active occurrences (`active`, and `title` or
 * `time` for the current event), so `dismiss` can hide what Loxone currently shows, including
 * during a sensor's lead or lag time. Sensors about the next event don't count: they always show
 * something, and dismissing would then hide events far ahead.
 */
export class ShownFilters {
  private readonly filters = new Set<EventFilter>()

  /** @returns a handle that removes the filter again when disposed */
  add(filter: EventFilter): DisposableLike {
    this.filters.add(filter)
    return { dispose: () => void this.filters.delete(filter) }
  }

  /** whether some sensor shows this occurrence now */
  shows(occurrence: Occurrence, now: number) {
    for (const filter of this.filters) if (filter.matches(occurrence) && filter.isActive(occurrence, now)) return true
    return false
  }
}
