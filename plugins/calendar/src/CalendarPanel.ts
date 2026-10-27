import type { Panel } from "@lox-nexus/plugin-sdk"
import type { Agenda } from "./agenda/Agenda.ts"
import type { CalendarSource } from "./feed/CalendarSource.ts"
import type { Occurrence } from "./ics/Occurrence.ts"
import type { Zone } from "./time/Zone.ts"

type Item = { label: string; value: string }

/**
 * The status view: how reading the feed goes, then the next occurrences as "when → title", so
 * recurrences, all-day events and time zones can be checked at a glance. A key-value panel
 * rather than a table, because the SDK's panel is one or the other and the facts matter as much.
 * The feed is named by its host only; the link itself is secret.
 */
export class CalendarPanel {
  static readonly UPCOMING = 15

  constructor(
    private readonly source: Pick<CalendarSource, "lastSuccess" | "lastError" | "skipped" | "truncated">,
    private readonly agenda: Pick<Agenda, "all" | "isDismissed" | "dismissedCount">,
    private readonly zone: Zone,
    private readonly host: string
  ) {}

  build(now: number): Panel {
    const upcoming = this.agenda.all.filter(occurrence => occurrence.end.getTime() > now)
    const items: Item[] = [
      { label: "Feed", value: this.host },
      { label: "Last successful read", value: this.source.lastSuccess?.toISOString() ?? "never" },
      { label: "Upcoming events (400 days)", value: String(upcoming.length) },
      { label: "Dismissed", value: String(this.agenda.dismissedCount) },
      { label: "Time zone", value: this.zone.id }
    ]
    const error = this.source.lastError
    if (error) items.push({ label: "Last error", value: `${error.message} (${error.at.toISOString()})` })
    if (this.source.skipped.length > 0) items.push({ label: "Left out (unreadable or repeating too often)", value: this.source.skipped.join(", ") })
    if (this.source.truncated.length > 0) items.push({ label: "Cut short (too many occurrences)", value: this.source.truncated.join(", ") })
    for (const occurrence of upcoming.slice(0, CalendarPanel.UPCOMING)) items.push(this.row(occurrence))
    return { type: "keyValue", items }
  }

  private row(occurrence: Occurrence): Item {
    const title = occurrence.summary || "(no title)"
    return { label: this.when(occurrence), value: this.agenda.isDismissed(occurrence) ? `${title} (dismissed)` : title }
  }

  private when({ start, end, allDay }: Occurrence) {
    const zone = this.zone
    if (allDay) {
      // the end is exclusive: a one-day event ends at the next midnight
      const last = zone.date(new Date(end.getTime() - 1))
      return last === zone.date(start) ? `${last}, all day` : `${zone.date(start)} – ${last}, all day`
    }
    if (zone.date(start) === zone.date(end)) return `${zone.dateTime(start)} – ${zone.dateTime(end).slice(11)}`
    return `${zone.dateTime(start)} – ${zone.dateTime(end)}`
  }
}
