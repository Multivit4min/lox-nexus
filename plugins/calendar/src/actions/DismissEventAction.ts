import { Action } from "@lox-nexus/plugin-sdk"
import type { CalendarPlugin } from "../CalendarPlugin.ts"
import { eventInput, type EventInput } from "./EventInput.ts"

/** Hides one occurrence from every sensor, like the `dismiss` actuator; on its row of the events table. */
export class DismissEventAction extends Action<CalendarPlugin, EventInput> {
  static readonly id = "dismiss-event"
  static readonly label = "Dismiss"
  static readonly description = "Hides this event from every sensor of the instance, until a day after it ends"
  static readonly input = eventInput
  static readonly placement = "panel"

  run() {
    const occurrence = this.plugin.agenda.find(this.input.event)
    if (!occurrence) throw new Error("the event isn't in the calendar any more")
    const title = occurrence.summary || "the event"
    // another tab or the actuator may have been first
    if (!this.plugin.agenda.dismiss([occurrence], this.plugin.clock.now())) return `${title} was already dismissed`
    // logged like the actuator's, so the log tells who hid an event
    this.plugin.log.info(`dismissed "${occurrence.summary}" from the panel`)
    return `Dismissed ${title}`
  }
}
