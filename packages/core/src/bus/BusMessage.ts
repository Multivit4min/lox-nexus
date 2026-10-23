import type { Value } from "@lox-nexus/plugin-sdk/values"

/**
 * What a bus message means. Subscribers get state, command, result and event; taps (the Recorder)
 * additionally see force and release. See "Implementation notes (M2)" in docs/architecture.md.
 */
export type MessageKind =
  /** a signal's value changed (retained, deduped) */
  | "state"
  /** an instruction to a target; never deduped so pulses work */
  | "command"
  /** outcome of a command, e.g. from a plugin actuator */
  | "result"
  /** a topic was pinned to a value */
  | "force"
  /** a force was lifted */
  | "release"
  /** anything else worth seeing in the inspector: warnings, errors, lifecycle */
  | "event"

/** Who published a message; `id` is the plugin instance, wire, user or Miniserver id. */
export interface MessageSource {
  kind: "loxone" | "plugin" | "wire" | "user" | "system"
  id: string
  /** human name shown in the inspector, e.g. the wire's label */
  label?: string
}

/** Marks how a message came to be; none of them change the value itself. */
export interface MessageFlags {
  /** replayed from the snapshot at startup */
  restored?: true
  /** published by hand from the inspector */
  injected?: true
  /** the delivered value comes from a force */
  forced?: true
  /** a real publish that arrived while the topic was forced; recorded but not delivered */
  shadowed?: true
}

/** Why and for how long a topic is pinned. Persisted with the force (see ForceRecord). */
export interface ForceInfo {
  /** user or system that set the force, shown in the inspector */
  by: string
  reason?: string
  /** epoch ms of the automatic release */
  until?: number
  /** epoch ms when the force was first set; kept across restarts */
  at?: number
  /** how the forced value is delivered; defaults to the topic's declared kind */
  kind?: "state" | "command"
}

/**
 * One accepted message on the bus. Only the host mints these (ids, seq, trace), so a plugin cannot
 * forge causality; plugins hand in values and the bus fills in the rest.
 */
export interface BusMessage {
  /** unique per boot (`<bootId>-<seq>`), minted only by the host */
  id: string
  /** total order of accepted messages; restarts from 1 on each boot */
  seq: number
  /** epoch ms when the bus accepted the message */
  ts: number
  topic: string
  kind: MessageKind
  /** absent for result, release and event messages */
  value?: Value
  source: MessageSource
  /** id of the message that caused this one */
  causedBy?: string
  /** id of the first message of the chain */
  traceId: string
  /** number of causal hops from the root */
  depth: number
  /** ids of the wires on the causal path to this message, used to detect loops */
  via?: string[]
  flags?: MessageFlags
  /** set on force messages */
  force?: ForceInfo
  /** set on result messages; durationMs is how long the actuator took, in milliseconds */
  outcome?: { ok: boolean; error?: string; durationMs: number }
  /** free text: the message of an event, or the reason on a release */
  text?: string
}

/** What a new message needs to know about its cause. A BusMessage satisfies it. */
export interface Cause {
  id: string
  traceId: string
  depth: number
  via?: readonly string[]
}
