import { z } from "zod"
import { ValueSchema } from "../values/ValueSchema.ts"

/** bumped on any incompatible change; a worker announces its version in `hello` */
export const WIRE_VERSION = 1

/** correlates a request with its `response`; numbers chosen by the host */
const requestId = z.int().nonnegative()

/** A configured sensor or actuator, as the host knows it. */
export const SignalSpecSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["sensor", "actuator"]),
  /** the Sensor or Actuator class id, e.g. "powerflow" */
  capability: z.string().min(1),
  params: z.unknown()
})
export type SignalSpec = z.infer<typeof SignalSpecSchema>

/** An HTTP request to the plugin's webhook routes; `path` is below /hook/<instance>. */
export const HttpRequestSchema = z.object({
  method: z.string(),
  path: z.string(),
  query: z.record(z.string(), z.string()),
  headers: z.record(z.string(), z.string()),
  /** utf-8 text; empty without a body */
  body: z.string()
})
export type HttpRequest = z.infer<typeof HttpRequestSchema>

/**
 * Messages from the host to a plugin worker. Requests carry a `requestId` and are answered with
 * one `response`; the others are notifications.
 */
export const HostMessageSchema = z.discriminatedUnion("type", [
  /** the instance's config (validated in the worker) and its persisted store */
  z.object({ type: z.literal("init"), instanceId: z.string(), config: z.unknown(), store: z.record(z.string(), z.unknown()) }),
  /** what the plugin offers: config schema, sensors and actuators with their params (JSON Schema) */
  z.object({ type: z.literal("describe"), requestId }),
  z.object({ type: z.literal("signal.add"), requestId, signal: SignalSpecSchema }),
  z.object({ type: z.literal("signal.remove"), requestId, id: z.string() }),
  /** `causeId` is the bus message that triggered it; emits while handling it carry it back */
  z.object({ type: z.literal("actuate"), requestId, signalId: z.string(), value: ValueSchema, causeId: z.string().optional() }),
  z.object({ type: z.literal("catalog"), requestId }),
  z.object({ type: z.literal("panel"), requestId }),
  z.object({ type: z.literal("http.request"), requestId, request: HttpRequestSchema }),
  z.object({ type: z.literal("ping"), seq: z.int() }),
  /** dispose everything, answer `stopped`; the host terminates the worker after a grace period */
  z.object({ type: z.literal("shutdown") })
])
export type HostMessage = z.infer<typeof HostMessageSchema>
