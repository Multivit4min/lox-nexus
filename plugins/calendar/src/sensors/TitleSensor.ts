import { z } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { FilterParams } from "../filter/FilterParams.ts"
import type { Occurrence } from "../ics/Occurrence.ts"
import { CalendarSensor } from "./CalendarSensor.ts"

const titleParams = FilterParams.schema({
  which: z.enum(["current", "next"]).default("current").meta({
    title: "Event",
    description: "The current event is the active one (the one that started first), the next one is the first not active yet",
    enumLabels: { current: "Current event", next: "Next event" }
  }),
  show: z.enum(["summary", "description", "location"]).default("summary").meta({
    title: "Text to send", description: "Which text of the event to send",
    enumLabels: { summary: "Title", description: "Description", location: "Location" }
  })
})

/** A text of the current or next matching occurrence; "" when there is none. */
export class TitleSensor extends CalendarSensor<z.output<typeof titleParams>> {
  static readonly id = "title"
  static readonly label = "Event title"
  static readonly description = "A text of the current or next matching event, such as its title"
  static readonly params = titleParams
  static readonly valueType = "string"

  protected override get showsCurrent() {
    return this.params.which === "current"
  }

  protected update(occurrences: Occurrence[], now: number) {
    const occurrence = this.params.which === "current"
      ? this.filter.current(occurrences, now)
      : this.filter.next(occurrences, now)
    this.emit(Value.string(occurrence?.[this.params.show] ?? ""))
  }
}
