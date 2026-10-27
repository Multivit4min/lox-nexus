import type { CatalogEntry, CatalogNode } from "@lox-nexus/plugin-sdk"
import type { Occurrence } from "../ics/Occurrence.ts"

/**
 * Ready-to-add signals: a set for any event, and one per distinct title among the upcoming
 * occurrences (soonest first), filtered on that title.
 */
export class CalendarCatalog {
  static readonly MAX_TITLES = 50

  /** @param occurrences sorted by start */
  constructor(private readonly occurrences: Occurrence[], private readonly now: number) {}

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
      CalendarCatalog.sensor("active", {}, "Event active"),
      CalendarCatalog.sensor("title", {}, "Current event title"),
      CalendarCatalog.sensor("title", { which: "next" }, "Next event title"),
      CalendarCatalog.sensor("time", { which: "nextStart" }, "Minutes until the next event"),
      CalendarCatalog.sensor("time", { which: "currentEnd" }, "Minutes until the current event ends"),
      CalendarCatalog.actuator("dismiss", {}, "Dismiss the active events")
    ]
  }

  private byTitle(title: string): CatalogEntry[] {
    const match = { match: title }
    return [
      CalendarCatalog.sensor("active", match, `${title} active`),
      CalendarCatalog.sensor("time", { ...match, which: "nextStart" }, `Minutes until the next ${title}`),
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

  private static sensor(capability: string, params: object, label: string): CatalogEntry {
    return { kind: "sensor", capability, params, label }
  }

  private static actuator(capability: string, params: object, label: string): CatalogEntry {
    return { kind: "actuator", capability, params, label }
  }
}
