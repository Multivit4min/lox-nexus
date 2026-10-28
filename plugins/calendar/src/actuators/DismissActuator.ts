import { Actuator } from "@lox-nexus/plugin-sdk"
import type { ValueOf } from "@lox-nexus/plugin-sdk/values"
import type { CalendarPlugin } from "../CalendarPlugin.ts"
import { EventFilter } from "../filter/EventFilter.ts"
import { FilterParams, type Filter } from "../filter/FilterParams.ts"

/**
 * On true, dismisses the matching occurrences that are active now, by this actuator's own lead
 * and lag or by those of a sensor of the instance that shows them (see ShownFilters): an `active`
 * sensor with a 12 h lead shows tomorrow's waste collection tonight, and dismiss hides it.
 * Every sensor of the instance skips a dismissed occurrence from then on. Only that occurrence,
 * not its whole series (the old integration hid every occurrence of a recurring event). False
 * does nothing, so a Loxone pulse acts once.
 */
export class DismissActuator extends Actuator<CalendarPlugin, Filter, ValueOf<"boolean">> {
  static readonly id = "dismiss"
  static readonly label = "Dismiss active events"
  static readonly description = "On a pulse, hides the matching events that are active now, e.g. after the bins were put out"
  static readonly params = FilterParams.schema({})
  static readonly accepts = "boolean"

  private readonly filter = new EventFilter(this.params)

  run(value: ValueOf<"boolean">) {
    if (!value.value) return
    const now = Date.now()
    const agenda = this.plugin.agenda
    const shown = this.plugin.shown
    const active = agenda.visible.filter(occurrence =>
      this.filter.matches(occurrence) && (this.filter.isActive(occurrence, now) || shown.shows(occurrence, now)))
    if (active.length === 0) return this.plugin.log.info("nothing to dismiss: no matching event is active or shown")
    agenda.dismiss(active, now)
    this.plugin.log.info(`dismissed ${active.map(occurrence => `"${occurrence.summary}"`).join(", ")}`)
  }
}
