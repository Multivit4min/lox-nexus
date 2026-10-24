import { z } from "zod"
import { ValueSchema } from "../values/ValueSchema.ts"

/** The status a plugin reports for itself; the host adds its own lifecycle states around it. */
export const PluginHealthSchema = z.enum(["running", "degraded"])
export type PluginHealth = z.infer<typeof PluginHealthSchema>

export const LogLevelSchema = z.enum(["debug", "info", "warn", "error"])
export type LogLevel = z.infer<typeof LogLevelSchema>

/** bounded, so a misbehaving plugin can't push megabytes per message through the host */
const text = z.string().max(10_000)

/**
 * Messages from a plugin worker to the host. The host validates every one of them: a worker that
 * sends something else is treated as broken.
 */
export const WorkerMessageSchema = z.discriminatedUnion("type", [
  /** first message after loading; `version` is the wire version the plugin was built with */
  z.object({ type: z.literal("hello"), version: z.int() }),
  /** init done and start() returned */
  z.object({ type: z.literal("ready") }),
  /** init failed (invalid config, start threw); the host does not restart it */
  z.object({ type: z.literal("failed"), error: text }),
  z.object({ type: z.literal("emit"), signalId: z.string(), value: ValueSchema, causeId: z.string().optional() }),
  z.object({ type: z.literal("status"), status: PluginHealthSchema, message: text.optional() }),
  z.object({ type: z.literal("log"), level: LogLevelSchema, message: text, data: z.unknown().optional(), causeId: z.string().optional() }),
  z.object({ type: z.literal("store.set"), key: z.string().min(1).max(200), value: z.unknown() }),
  z.object({ type: z.literal("store.delete"), key: z.string().min(1).max(200) }),
  /** answer to a request; `error` is a message for the user */
  z.object({ type: z.literal("response"), requestId: z.int(), ok: z.boolean(), result: z.unknown().optional(), error: text.optional() }),
  /** a sensor or actuator stopped working on its own (its start rejected later, its stream ended) */
  z.object({ type: z.literal("signal.error"), signalId: z.string(), error: text }),
  z.object({ type: z.literal("pong"), seq: z.int() }),
  /** shutdown finished */
  z.object({ type: z.literal("stopped") })
])
export type WorkerMessage = z.infer<typeof WorkerMessageSchema>
