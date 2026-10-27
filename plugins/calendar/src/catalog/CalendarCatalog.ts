import type { CatalogEntry, CatalogNode } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { EventFilter } from "../filter/EventFilter.ts"
import { FilterParams } from "../filter/FilterParams.ts"
import type { Occurrence } from "../ics/Occurrence.ts"
import { TimeFormat } from "../time/TimeFormat.ts"
import type { Zone } from "../time/Zone.ts"

/**
 * Ready-to-add signals: a set for any event, and one per distinct title among the upcoming
 * occurrences (soonest first), filtered on that title. Sensors carry the value they would send
 * now, worked out like the sensor does.
 */
export class CalendarCatalog {
  static readonly MAX_TITLES = 50

  /** @param occurrences the ones that aren't dismissed, sorted by start */
  constructor(private readonly occurrences: Occurrence[], private readonly now: number, private readonly zone: Zone) {}

  build(): CatalogNode[] {
    const titles = this.titles()
    const nodes: CatalogNode[] = [{ label: "Any event", entries: this.anyEvent() }]
    if (titles.length > 0) {
      nodes.push({ label: "Events by title", children: titles.map(title => ({ label: title, entries: this.byTitle(title) })) })
    }
    return nodes
  }

  private anyEvent(): CatalogEntry[] {
    return [
      this.sensor("active", {}, "Event active"),
      this.sensor("title", {}, "Current event title"),
      this.sensor("title", { which: "next" }, "Next event title"),
      this.sensor("time", { which: "nextStart" }, "Minutes until the next event"),
      this.sensor("time", { which: "currentEnd" }, "Minutes until the current event ends"),
      CalendarCatalog.actuator("dismiss", {}, "Dismiss the active events")
    ]
  }

  private byTitle(title: string): CatalogEntry[] {
    const match = { match: title }
    return [
      this.sensor("active", match, `${title} active`),
      this.sensor("time", { ...match, which: "nextStart" }, `Minutes until the next ${title}`),
      CalendarCatalog.actuator("dismiss", match, `Dismiss ${title}`)
    ]
  }

  // in the order they next happen, so what's coming up is at the top
  private titles() {
    const titles = new Set<string>()
    for (const occurrence of this.occurrences) {
      if (titles.size >= CalendarCatalog.MAX_TITLES) break
      if (occurrence.end.getTime() > this.now && occurrence.summary) titles.add(occurrence.summary)
    }
    return [...titles]
  }

  private sensor(capability: string, params: { match?: string; which?: string }, label: string): CatalogEntry {
    const filter = new EventFilter(FilterParams.schema({}).parse(params))
    const current = filter.current(this.occurrences, this.now)
    const next = filter.next(this.occurrences, this.now)
    const entry: CatalogEntry = { kind: "sensor", capability, params, label }
    if (capability === "active") return { ...entry, value: Value.boolean(current !== undefined) }
    if (capability === "title") return { ...entry, value: Value.string((params.which === "next" ? next : current)?.summary ?? "") }
    const at = params.which === "currentEnd" ? current?.end : next?.start
    return { ...entry, value: Value.number(new TimeFormat("minutesUntil", this.zone).value(at, this.now)), unit: "min" }
  }

  private static actuator(capability: string, params: object, label: string): CatalogEntry {
    return { kind: "actuator", capability, params, label }
  }
}
