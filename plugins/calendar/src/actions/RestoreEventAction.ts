import { Action } from "@lox-nexus/plugin-sdk"
import type { CalendarPlugin } from "../CalendarPlugin.ts"
import { eventInput, type EventInput } from "./EventInput.ts"

/** Shows a dismissed occurrence again; on its row of the events table. The actuator can't undo a dismissal. */
export class RestoreEventAction extends Action<CalendarPlugin, EventInput> {
  static readonly id = "restore-event"
  static readonly label = "Restore"
  static readonly description = "Shows a dismissed event to the sensors again"
  static readonly input = eventInput
  static readonly placement = "panel"

  run() {
    const summary = this.plugin.agenda.find(this.input.event)?.summary
    if (!this.plugin.agenda.restore(this.input.event)) throw new Error("the event isn't dismissed")
    this.plugin.log.info(`restored "${summary ?? this.input.event}" from the panel`)
    return `Restored ${summary || "the event"}`
  }
}
