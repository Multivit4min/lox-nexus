import type { Jitter } from "./Jitter.ts"
import type { Event, MergedSchedule } from "./MergedSchedule.ts"

/** One event with its random offset: `raw` is the scheduled instant (what skips refer to), `at` when it happens. */
export interface Occurrence extends Event {
  at: number
}

/**
 * The events of a schedule with their random offsets.
 *
 * The rule that keeps offsets from reordering anything: an event moves at most halfway (less a
 * second) towards the events before and after it, whatever offset it drew. So a window never
 * closes before it opens, steps keep their order, and an every-minute schedule with a large
 * offset moves by at most 29 s. It needs only the neighbours, so any moment can be worked out
 * on its own, also after a restart.
 */
export class Timeline {
  /** a bound for searches; offsets never reorder, so few events are ever looked at */
  private static readonly MAX_STEPS = 1000
  /** offsets of recent events: a schedule asks about the same few every minute, and each needs its neighbours */
  private static readonly CACHED_OFFSETS = 256
  private readonly offsets = new Map<number, number>()

  constructor(readonly schedule: MergedSchedule, private readonly jitter: Jitter) {}

  /** the first occurrence happening after `after` */
  next(after: number): Occurrence | undefined {
    let event = this.schedule.next(after - this.jitter.maxMs)
    for (let step = 0; event !== undefined && step < Timeline.MAX_STEPS; step++) {
      const occurrence = this.occurrence(event)
      if (occurrence.at > after) return occurrence
      event = this.schedule.next(event.raw)
    }
    return undefined
  }

  /** the last occurrence happening at or before `atOrBefore` */
  previous(atOrBefore: number): Occurrence | undefined {
    let event = this.schedule.previous(atOrBefore + this.jitter.maxMs)
    for (let step = 0; event !== undefined && step < Timeline.MAX_STEPS; step++) {
      const occurrence = this.occurrence(event)
      if (occurrence.at <= atOrBefore) return occurrence
      event = this.schedule.previous(event.raw - 1)
    }
    return undefined
  }

  /** the first occurrence after `after` that `accept` takes, e.g. a window's next end */
  find(after: number, accept: (occurrence: Occurrence) => boolean): Occurrence | undefined {
    let occurrence = this.next(after)
    for (let step = 0; occurrence !== undefined && step < Timeline.MAX_STEPS; step++) {
      if (accept(occurrence)) return occurrence
      occurrence = this.next(occurrence.at)
    }
    return undefined
  }

  /** the next `count` occurrences after `after` that `accept` takes, in the order they happen */
  upcoming(after: number, count: number, accept: (occurrence: Occurrence) => boolean = () => true): Occurrence[] {
    const occurrences: Occurrence[] = []
    let cursor = after
    while (occurrences.length < count) {
      const next = this.find(cursor, accept)
      if (!next) break
      occurrences.push(next)
      cursor = next.at
    }
    return occurrences
  }

  private occurrence(event: Event): Occurrence {
    return { ...event, at: event.raw + this.offset(event.raw) }
  }

  private offset(raw: number) {
    if (this.jitter.maxMs === 0) return 0
    let offset = this.offsets.get(raw)
    if (offset === undefined) {
      if (this.offsets.size >= Timeline.CACHED_OFFSETS) this.offsets.clear()
      offset = this.compute(raw)
      this.offsets.set(raw, offset)
    }
    return offset
  }

  private compute(raw: number) {
    const max = this.jitter.maxMs
    const before = this.schedule.previous(raw - 1)?.raw
    const after = this.schedule.next(raw)?.raw
    const low = before === undefined ? max : Timeline.halfGap(raw - before, max)
    const high = after === undefined ? max : Timeline.halfGap(after - raw, max)
    return Math.min(Math.max(this.jitter.offset(raw), -low), high)
  }

  /** how far an event may move towards a neighbour `gap` ms away: less than half the way, in whole seconds */
  private static halfGap(gap: number, max: number) {
    return Math.min(max, Math.max(0, Math.floor(gap / 2000) * 1000 - 1000))
  }
}
