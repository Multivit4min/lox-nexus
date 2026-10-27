import { Value } from "@lox-nexus/plugin-sdk/values"
import type { EntityState } from "./EntityStore.ts"

/**
 * Turns Home Assistant states and attributes into bus values. States are always strings in Home
 * Assistant, so they are read: numbers become numbers and on/off becomes a boolean, anything else
 * (e.g. "heat", "locked", "2026-10-27T10:00:00+00:00") stays a string.
 */
export class StateValue {
  /** states that mean "no reading": the last value stays rather than becoming 0 on a Miniserver */
  static readonly MISSING = new Set(["unavailable", "unknown"])
  private static readonly NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/

  /** undefined when there's nothing to report: the entity has no reading or lacks the attribute */
  static of(entity: EntityState, attribute?: string): Value | undefined {
    return attribute === undefined ? StateValue.fromState(entity.state) : StateValue.fromAttribute(entity.attributes[attribute])
  }

  static fromState(state: string): Value | undefined {
    if (StateValue.MISSING.has(state)) return undefined
    if (state === "on" || state === "off") return Value.boolean(state === "on")
    if (StateValue.NUMBER.test(state)) return Value.number(Number(state))
    return Value.string(state)
  }

  /** attributes are typed JSON already; lists and objects aren't a single value */
  static fromAttribute(raw: unknown): Value | undefined {
    if (raw === null) return Value.null()
    if (typeof raw === "number") return Value.number(raw)
    if (typeof raw === "boolean") return Value.boolean(raw)
    if (typeof raw === "string") return Value.string(raw)
    return undefined
  }
}
