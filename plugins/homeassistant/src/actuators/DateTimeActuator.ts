import type { Value } from "@lox-nexus/plugin-sdk/values"
import { EntityId } from "../entities/EntityId.ts"
import type { EntityState } from "../entities/EntityStore.ts"
import { StateValue } from "../entities/StateValue.ts"
import { DateTimeParts } from "./DateTimeParts.ts"
import { EntityActuator } from "./EntityActuator.ts"

/** the set_value field of the date, time and datetime entity domains */
const FIELDS: Record<string, "date" | "time" | "datetime"> = { date: "date", time: "time", datetime: "datetime" }

/**
 * Sets a date/time helper (input_datetime), or a date, time or datetime entity. Takes text
 * "YYYY-MM-DD HH:MM:SS" (or only the date, or only "HH:MM(:SS)"), or a number of seconds since
 * midnight for a time of day: Loxone calculates in numbers, and a time of day as seconds is what
 * a formula block can produce. Setting only the time of a helper with a date keeps its date (Home
 * Assistant's behaviour). Empty text does nothing.
 */
export class DateTimeActuator extends EntityActuator<Value> {
  static readonly id = "dateTime"
  static readonly label = "Date and time"
  static readonly description = "Sets a date/time helper from text \"YYYY-MM-DD HH:MM:SS\", or its time of day from seconds since midnight"
  static readonly accepts = "any"
  static readonly domains = ["input_datetime", ...Object.keys(FIELDS)]
  static readonly params = EntityId.paramsFor("input_datetime.wake_up")
  static readonly concurrency = "latest"

  static current(entity: EntityState) {
    return StateValue.current(entity)
  }

  async run(value: Value) {
    const parts = DateTimeParts.of(value)
    if (!parts) return
    if (this.domain === "input_datetime") return this.setHelper(parts)
    const field = FIELDS[this.domain]!
    const text = field === "datetime" ? parts.dateTime : parts[field]
    if (text === undefined) throw new Error(`${this.params.entityId} needs ${field === "datetime" ? "a date and a time" : `a ${field}`}`)
    await this.call("set_value", { [field]: text })
  }

  /** a helper takes either part alone; one that holds only a date (or only a time) is told so, rather than Home Assistant's "Nothing to set" */
  private async setHelper(parts: DateTimeParts) {
    const { has_date: hasDate = true, has_time: hasTime = true } = this.entity?.attributes ?? {}
    const date = hasDate === false ? undefined : parts.date
    const time = hasTime === false ? undefined : parts.time
    if (date === undefined && time === undefined) {
      throw new Error(`${this.params.entityId} holds only a ${hasDate === false ? "time" : "date"}; the value has none`)
    }
    const data = date !== undefined && time !== undefined ? { datetime: `${date} ${time}` } : date !== undefined ? { date } : { time }
    await this.call("set_datetime", data)
  }
}
