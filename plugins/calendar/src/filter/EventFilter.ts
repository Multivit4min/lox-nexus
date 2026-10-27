import type { Occurrence } from "../ics/Occurrence.ts"
import type { Filter } from "./FilterParams.ts"

/**
 * Applies a signal's filter params to occurrences. An occurrence is active from its start minus
 * the lead until its end plus the lag; the end counts (the old integration ignored it and used
 * "start plus time after" instead). The lists passed in are sorted by start.
 */
export class EventFilter {
  private readonly test: (text: string) => boolean
  private readonly leadMs: number
  private readonly lagMs: number

  constructor(private readonly params: Filter) {
    this.leadMs = params.leadMinutes * 60_000
    this.lagMs = params.lagMinutes * 60_000
    this.test = EventFilter.matcher(params)
  }

  matches(occurrence: Occurrence) {
    const { field } = this.params
    if (field !== "any") return this.test(occurrence[field])
    return [occurrence.summary, occurrence.description, occurrence.location].some(this.test)
  }

  /** when the occurrence becomes active */
  from(occurrence: Occurrence) {
    return occurrence.start.getTime() - this.leadMs
  }

  /** when it stops being active */
  until(occurrence: Occurrence) {
    return occurrence.end.getTime() + this.lagMs
  }

  isActive(occurrence: Occurrence, now: number) {
    return this.from(occurrence) <= now && now < this.until(occurrence)
  }

  /** the active matching occurrence that started first */
  current(occurrences: Occurrence[], now: number) {
    return occurrences.find(occurrence => this.isActive(occurrence, now) && this.matches(occurrence))
  }

  /** the first matching occurrence that isn't active yet */
  next(occurrences: Occurrence[], now: number) {
    // the lead is the same for all, so the order by start is the order by activation
    return occurrences.find(occurrence => this.from(occurrence) > now && this.matches(occurrence))
  }

  /** the next instant after now at which an occurrence becomes active or stops being active */
  nextChange(occurrences: Occurrence[], now: number) {
    let soonest: number | undefined
    for (const occurrence of occurrences) {
      for (const at of [this.from(occurrence), this.until(occurrence)]) {
        if (at > now && (soonest === undefined || at < soonest) && this.matches(occurrence)) soonest = at
      }
    }
    return soonest
  }

  private static matcher({ match, regex }: Filter): (text: string) => boolean {
    if (match === undefined) return () => true
    if (regex) {
      const pattern = new RegExp(match, "i")
      return text => pattern.test(text)
    }
    const needle = match.toLowerCase()
    return text => text.toLowerCase().includes(needle)
  }
}
