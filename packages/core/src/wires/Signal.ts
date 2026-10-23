import type { ValueType } from "@lox-nexus/plugin-sdk/values"

/**
 * Anything addressable on the bus: a Loxone packet id or a configured plugin sensor or actuator.
 * Wires reference signals by id, never by topic, so renaming a signal doesn't break wires.
 */
export interface Signal {
  id: string
  topic: string
  label: string
  /** sources publish values; targets receive them through wires */
  direction: "source" | "target"
  /** "any" accepts whatever arrives without conversion */
  valueType: ValueType | "any"
  /** how wires deliver to a target: as retained state or as a command */
  delivery: "state" | "command"
}
