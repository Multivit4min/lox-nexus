import { Action } from "@lox-nexus/plugin-sdk"
import type { CalendarPlugin } from "../CalendarPlugin.ts"

/** Reads the feed now instead of at the next interval, e.g. right after editing the calendar. */
export class ReadNowAction extends Action<CalendarPlugin, object> {
  static readonly id = "read-now"
  static readonly label = "Read now"
  static readonly description = "Reads the calendar feed now instead of at the next interval"
  static readonly placement = "panel"

  async run() {
    const source = this.plugin.source
    // a read in flight may have fetched the feed before the edit this click is about
    if (source.reading) await source.refresh()
    await source.refresh()
    if (source.problem) throw new Error(source.problem)
    return `Read ${this.plugin.agenda.all.length} occurrences`
  }
}
