import type { ValueType } from "@lox-nexus/plugin-sdk/values"
import type { SignalDisplay } from "./SignalDisplay.ts"

/** What a signal belongs to, so UIs can group signals and tell whether their owner is running. */
export interface SignalOwner {
  kind: "miniserver" | "plugin"
  /** the Miniserver's or plugin instance's id */
  id: string
}

/**
 * Anything addressable on the bus: a Loxone packet id or a configured plugin sensor or actuator.
 * Wires reference signals by id, never by topic, so renaming a signal doesn't break wires.
 */
export interface Signal extends SignalDisplay {
  /** stable identifier; what WireConfig.sourceId and targetId refer to */
  id: string
  /** bus topic, unique per direction; see Topic for the allowed characters */
  topic: string
  /** human name for UIs */
  label: string
  /** sources publish values; targets receive them through wires */
  direction: "source" | "target"
  /** "any" accepts whatever arrives without conversion */
  valueType: ValueType | "any"
  /** how wires deliver to a target: as retained state or as a command */
  delivery: "state" | "command"
  /** absent for signals not owned by a Miniserver or plugin instance (tests, future system signals) */
  owner?: SignalOwner
}
