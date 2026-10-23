import type { Value } from "@lox-nexus/plugin-sdk/values"

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

export interface MessageSource {
  kind: "loxone" | "plugin" | "wire" | "user" | "system"
  id: string
  /** human name shown in the inspector, e.g. the wire's label */
  label?: string
}

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

export interface ForceInfo {
  by: string
  reason?: string
  /** epoch ms of the automatic release */
  until?: number
}

export interface BusMessage {
  /** unique per boot, minted only by the host */
  id: string
  /** total order of accepted messages */
  seq: number
  ts: number
  topic: string
  kind: MessageKind
  value?: Value
  source: MessageSource
  /** id of the message that caused this one */
  causedBy?: string
  /** id of the first message of the chain */
  traceId: string
  /** number of causal hops from the root */
  depth: number
  flags?: MessageFlags
  /** set on force messages */
  force?: ForceInfo
  /** set on result messages */
  outcome?: { ok: boolean; error?: string; durationMs: number }
  /** free text, used by event messages */
  text?: string
}

/** What a new message needs to know about its cause. A BusMessage satisfies it. */
export interface Cause {
  id: string
  traceId: string
  depth: number
}
