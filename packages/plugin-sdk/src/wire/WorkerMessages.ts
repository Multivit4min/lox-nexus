import { z } from "zod"
import { ValueSchema } from "../values/ValueSchema.ts"

/** The status a plugin reports for itself; the host adds its own lifecycle states around it. */
export const PluginHealthSchema = z.enum(["running", "degraded"])
export type PluginHealth = z.infer<typeof PluginHealthSchema>

/** log levels in increasing severity; the host decides which ones it keeps */
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
  // features: additions to the version the worker understands, so the host sends them only to those that do ("log.level")
  z.object({ type: z.literal("hello"), version: z.int(), features: z.array(z.string().max(50)).max(50).optional() }),
  /** init done and start() returned */
  z.object({ type: z.literal("ready") }),
  /** init failed (invalid config, start threw); the host does not restart it */
  z.object({ type: z.literal("failed"), error: text }),
  /** a sensor value; `causeId` is set when it came out of work started by an `actuate` */
  z.object({ type: z.literal("emit"), signalId: z.string(), value: ValueSchema, causeId: z.string().optional() }),
  /** the plugin's own health; "running" clears an earlier "degraded" */
  z.object({ type: z.literal("status"), status: PluginHealthSchema, message: text.optional() }),
  /** `data` is structured-cloned; `causeId` ties the line to the bus message being handled */
  z.object({ type: z.literal("log"), level: LogLevelSchema, message: text, data: z.unknown().optional(), causeId: z.string().optional() }),
  /** `value` must be JSON; the host persists it per instance */
  z.object({ type: z.literal("store.set"), key: z.string().min(1).max(200), value: z.unknown() }),
  z.object({ type: z.literal("store.delete"), key: z.string().min(1).max(200) }),
  /** init migrated the stored config; the host stores it. Only to hosts whose init carried configVersion */
  z.object({ type: z.literal("config.migrated"), config: z.unknown(), version: z.int().min(1) }),
  /** answer to a request; `error` is a message for the user */
  z.object({ type: z.literal("response"), requestId: z.int(), ok: z.boolean(), result: z.unknown().optional(), error: text.optional() }),
  /** a sensor or actuator stopped working on its own (its start rejected later, its stream ended) */
  z.object({ type: z.literal("signal.error"), signalId: z.string(), error: text }),
  /** the sensor works again without a value to send (an entity back as unavailable); clears signal.error */
  z.object({ type: z.literal("signal.recovered"), signalId: z.string() }),
  /** a `watch.values` batch was handled (also when the plugin threw); the host sends more only after it */
  z.object({ type: z.literal("watch.ack"), seq: z.int().nonnegative() }),
  /** answer to `ping`, echoing its `seq` */
  z.object({ type: z.literal("pong"), seq: z.int() }),
  /** shutdown finished */
  z.object({ type: z.literal("stopped") })
])
export type WorkerMessage = z.infer<typeof WorkerMessageSchema>
