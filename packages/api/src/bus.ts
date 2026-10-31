import { ValueSchema, type Value } from "@lox-nexus/plugin-sdk/values"
import { z } from "zod"

/** Mirrors core's BusMessage; duplicated as a type so the web app doesn't depend on core. */
export interface BusMessageDto {
  id: string
  /** bus-wide sequence number, orders messages with equal timestamps */
  seq: number
  /** epoch ms */
  ts: number
  topic: string
  kind: "state" | "command" | "result" | "force" | "release" | "event"
  value?: Value
  source: { kind: "loxone" | "plugin" | "wire" | "user" | "system"; id: string; label?: string }
  /** id of the message that triggered this one */
  causedBy?: string
  traceId: string
  /** hops from the root of the trace */
  depth: number
  /** ids of the wires this message passed through */
  via?: string[]
  flags?: { restored?: true; injected?: true; forced?: true; shadowed?: true; replayed?: true }
  force?: { by: string; reason?: string; until?: number; at?: number; kind?: "state" | "command" }
  /** result of a command; durationMs is milliseconds */
  outcome?: { ok: boolean; error?: string; durationMs: number }
  text?: string
}

/** One node of GET /api/bus/messages/:id/trace */
export interface TraceNodeDto {
  message: BusMessageDto
  children: TraceNodeDto[]
}

/** An active force as listed by GET /api/bus/forces */
export interface ForceDto {
  topic: string
  value: Value
  by: string
  reason?: string
  /** epoch ms of the automatic release; absent means until released by hand */
  until?: number
  /** epoch ms the force was set */
  at: number
  /** whether the forced value is delivered as a state or as a command */
  kind: "state" | "command"
}

/** a concrete topic, bounded so a request can't ship megabytes */
const topic = z.string().min(1).max(512)

/** POST /api/bus/forces; `by` is the logged-in user */
export const ForceRequestSchema = z.object({
  topic,
  value: ValueSchema,
  reason: z.string().max(500).optional(),
  /** epoch ms of the automatic release; must lie in the future */
  until: z.int().positive().optional()
})
export type ForceRequest = z.infer<typeof ForceRequestSchema>

/** POST /api/bus/inject: publish one value by hand, flagged as injected */
export const InjectRequestSchema = z.object({
  topic,
  value: ValueSchema,
  kind: z.enum(["state", "command"]).default("state")
})
/** `kind` is optional on input: it defaults to "state" */
export type InjectRequest = z.input<typeof InjectRequestSchema>

/** GET /api/bus/messages query */
/** limit counts messages (default 500); pattern is a topic pattern such as `loxone/#`, default all */
export const RecentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(10_000).default(500),
  pattern: z.string().min(1).max(512).optional()
})
