import { ValueSchema, type Value } from "@lox-nexus/plugin-sdk/values"
import { z } from "zod"

/** Mirrors core's BusMessage; duplicated as a type so the web app doesn't depend on core. */
export interface BusMessageDto {
  id: string
  seq: number
  ts: number
  topic: string
  kind: "state" | "command" | "result" | "force" | "release" | "event"
  value?: Value
  source: { kind: "loxone" | "plugin" | "wire" | "user" | "system"; id: string; label?: string }
  causedBy?: string
  traceId: string
  depth: number
  via?: string[]
  flags?: { restored?: true; injected?: true; forced?: true; shadowed?: true }
  force?: { by: string; reason?: string; until?: number; at?: number; kind?: "state" | "command" }
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
  until?: number
  at: number
  kind: "state" | "command"
}

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
export type InjectRequest = z.input<typeof InjectRequestSchema>

/** GET /api/bus/messages query */
export const RecentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(10_000).default(500),
  pattern: z.string().min(1).max(512).optional()
})
