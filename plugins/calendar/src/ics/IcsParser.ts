import { createHash } from "node:crypto"
import ical, { type CalendarResponse, type ParameterValue, type VEvent } from "node-ical"
import { IcsSplitter } from "./IcsSplitter.ts"

/** The events of a feed that can be used, and what had to be left out. */
export interface ParseResult {
  /** base events; moved occurrences (RECURRENCE-ID) are attached to their series */
  events: VEvent[]
  /** events that couldn't be read, by summary or UID */
  skipped: string[]
}

/**
 * Parses iCalendar text with node-ical, tolerating broken feeds: if the feed as a whole can't be
 * parsed (node-ical throws on a single malformed RRULE), each UID is parsed on its own and only
 * the broken ones are left out. Events with an unreadable start or end are left out too, and
 * events without a UID get a stable one.
 */
export class IcsParser {
  /** @throws Error when the text is not an iCalendar feed */
  parse(text: string): ParseResult {
    if (!/^\s*BEGIN:VCALENDAR/i.test(text)) throw new Error(`not an iCalendar feed (starts with ${JSON.stringify(text.trimStart().slice(0, 30))})`)
    const skipped: string[] = []
    const components = this.components(text, skipped)
    const events: VEvent[] = []
    for (const component of components) {
      if (component?.type !== "VEVENT") continue
      const event = component as VEvent
      if (!(event.start instanceof Date) || (event.end !== undefined && !(event.end instanceof Date))) skipped.push(IcsParser.label(event))
      else events.push(IcsParser.withUid(event))
    }
    return { events, skipped }
  }

  /** the summary, as plain text */
  static text(value: ParameterValue | undefined) {
    if (value === undefined) return ""
    return (typeof value === "string" ? value : value.val ?? "").trim()
  }

  /** what to call an event in the log and panel */
  static label(event: VEvent) {
    return IcsParser.text(event.summary) || event.uid || "an event without UID"
  }

  private components(text: string, skipped: string[]): CalendarResponse[string][] {
    try {
      return Object.values(ical.sync.parseICS(text))
    } catch {
      return IcsSplitter.split(text).flatMap(piece => {
        try {
          return Object.values(ical.sync.parseICS(piece.text))
        } catch {
          skipped.push(piece.label)
          return []
        }
      })
    }
  }

  // node-ical files an event without UID under a random key; dismissals need the same UID on every read
  private static withUid(event: VEvent): VEvent {
    if (typeof event.uid === "string" && event.uid !== "") return event
    const hash = createHash("sha256").update(`${event.start.toISOString()}\n${IcsParser.text(event.summary)}`).digest("hex")
    return { ...event, uid: `nouid:${hash.slice(0, 16)}` }
  }
}
