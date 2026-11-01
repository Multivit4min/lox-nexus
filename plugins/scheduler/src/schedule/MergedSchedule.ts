import type { CronSchedule } from "../cron/CronSchedule.ts"

/** An instant of a merged schedule, and which of its sources it belongs to. */
export interface Event {
  raw: number
  /** the source's position: a window's start is 0, its end 1 */
  index: number
}

/**
 * Several cron schedules as one sequence of events, in time order: a window's starts and ends, or
 * value steps. An instant two sources match is one event: of the source whose wall-clock time is
 * the latest (in the DST gap, 02:45 wins over 02:15 when both run at 03:00), else of the later
 * source in the list (a window that starts and ends at the same moment ends).
 */
export class MergedSchedule {
  /**
   * answers by the instant asked about: a timeline walks the same events every minute, each with
   * its neighbours, and with many sources each answer asks all of them. The answers never change.
   */
  private static readonly CACHED = 512
  private readonly nexts = new Map<number, Event | undefined>()
  private readonly previouses = new Map<number, Event | undefined>()

  constructor(readonly sources: readonly CronSchedule[]) {}

  next(after: number): Event | undefined {
    return MergedSchedule.cached(this.nexts, after, () => this.pick(this.sources.map(source => source.next(after)), (a, b) => a < b))
  }

  previous(atOrBefore: number): Event | undefined {
    return MergedSchedule.cached(this.previouses, atOrBefore, () => this.pick(this.sources.map(source => source.previous(atOrBefore)), (a, b) => a > b))
  }

  private static cached(cache: Map<number, Event | undefined>, key: number, compute: () => Event | undefined) {
    if (cache.has(key)) return cache.get(key)
    if (cache.size >= MergedSchedule.CACHED) cache.clear()
    const event = compute()
    cache.set(key, event)
    return event
  }

  private pick(instants: Array<number | undefined>, better: (a: number, b: number) => boolean): Event | undefined {
    let best: Event | undefined
    instants.forEach((raw, index) => {
      if (raw !== undefined && (best === undefined || better(raw, best.raw) || (raw === best.raw && this.wins(index, best.index, raw)))) best = { raw, index }
    })
    return best
  }

  // a tie: the time meant latest wins (the DST gap moves 02:15 and 02:45 both to 03:00), then the later source
  private wins(index: number, over: number, raw: number) {
    return (this.sources[index]?.scheduledWall(raw) ?? 0) >= (this.sources[over]?.scheduledWall(raw) ?? 0)
  }
}
