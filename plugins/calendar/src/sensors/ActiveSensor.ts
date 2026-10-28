import { Value } from "@lox-nexus/plugin-sdk/values"
import { FilterParams, type Filter } from "../filter/FilterParams.ts"
import type { Occurrence } from "../ics/Occurrence.ts"
import { CalendarSensor } from "./CalendarSensor.ts"

/** true while a matching occurrence that isn't dismissed is active (lead and lag included) */
export class ActiveSensor extends CalendarSensor<Filter> {
  static readonly id = "active"
  static readonly label = "Event active"
  static readonly description = "On while a matching event is going on (with its lead and lag time)"
  static readonly params = FilterParams.schema({})
  static readonly valueType = "boolean"

  protected update(occurrences: Occurrence[], now: number) {
    this.emit(Value.boolean(this.filter.current(occurrences, now) !== undefined))
  }
}
