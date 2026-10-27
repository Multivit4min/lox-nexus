import ical, { type EventInstance, type VEvent } from "node-ical"
import { Zone } from "../time/Zone.ts"
import { IcsParser } from "./IcsParser.ts"
import type { Occurrence } from "./Occurrence.ts"

/** What one read of a feed gives: the occurrences in the window, sorted by start, and what was left out. */
export interface ReadResult {
  occurrences: Occurrence[]
  /** events left out entirely: unreadable, or repeating too often to expand (every minute) */
  skipped: string[]
  /** series cut short because they repeat so often, and the far future when the feed is huge */
  truncated: string[]
}

/**
 * Turns iCalendar text into occurrences: expands recurrences (RRULE, EXDATE, RECURRENCE-ID
 * overrides) within a window around now and resolves every time to an instant.
 *
 * Times with a known TZID (including Windows names from Outlook) are resolved by node-ical.
 * All-day events, floating times and times with a TZID nobody knows have no usable zone;
 * node-ical reads them in the server's zone, so they are re-read here as wall-clock times in the
 * plugin's zone.
 */
export class IcsReader {
  /** how far back occurrences are kept: covers the longest lag a signal may add after the end */
  static readonly PAST_MS = 24 * 3_600_000
  static readonly FUTURE_MS = 400 * 24 * 3_600_000
  /** a series keeps its first this many occurrences (an hourly one about six weeks), so dense series don't crowd out the rest */
  static readonly MAX_PER_SERIES = 1000
  /** a bound on memory for huge calendars (the worker has 128 MB); the far future is cut */
  static readonly MAX_OCCURRENCES = 20_000

  private readonly parser = new IcsParser()

  constructor(private readonly zone: Zone) {}

  /** @throws Error when the text is not an iCalendar feed */
  read(text: string, now: Date): ReadResult {
    const { events, skipped } = this.parser.parse(text)
    const occurrences: Occurrence[] = []
    const truncated: string[] = []
    for (const event of events) {
      try {
        const instances = this.expand(event, now)
        if (instances.length > IcsReader.MAX_PER_SERIES) truncated.push(IcsParser.label(event))
        for (const instance of instances.slice(0, IcsReader.MAX_PER_SERIES)) occurrences.push(this.occurrence(event.uid, instance))
      } catch {
        skipped.push(IcsParser.label(event))
      }
    }
    occurrences.sort((a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime())
    const cut = occurrences[IcsReader.MAX_OCCURRENCES]
    if (cut) truncated.push(`everything from ${this.zone.date(cut.start)} on (more than ${IcsReader.MAX_OCCURRENCES} occurrences)`)
    return { occurrences: occurrences.slice(0, IcsReader.MAX_OCCURRENCES), skipped, truncated }
  }

  private expand(event: VEvent, now: Date) {
    const from = new Date(now.getTime() - IcsReader.PAST_MS)
    const to = new Date(now.getTime() + IcsReader.FUTURE_MS)
    return ical.expandRecurringEvent(event, { from, to, expandOngoing: true }).filter(instance => instance.event.status !== "CANCELLED")
  }

  private occurrence(uid: string, instance: EventInstance): Occurrence {
    const start = this.instant(instance.start, instance.isFullDay)
    // a start with a zone and an end without one (or a plain mistake) can put the end first
    const end = new Date(Math.max(start.getTime(), this.instant(instance.end, instance.isFullDay).getTime()))
    return {
      uid, key: `${uid}@${start.toISOString()}`, start, end, allDay: instance.isFullDay,
      summary: IcsParser.text(instance.summary),
      description: IcsParser.text(instance.event.description),
      location: IcsParser.text(instance.event.location)
    }
  }

  // node-ical gives zone-less times as server-local Dates; their local fields are the wall clock
  private instant(date: Date & { tz?: string }, allDay: boolean) {
    if (!allDay && date.tz && Zone.isValid(date.tz)) return new Date(date.getTime())
    return this.zone.instant({
      year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(),
      hour: date.getHours(), minute: date.getMinutes(), second: date.getSeconds()
    })
  }
}
