import { z } from "zod"
import { ValueSchema } from "../values/ValueSchema.ts"
import { WatchedSignalSchema, WatchedValueSchema } from "./WatchShapes.ts"

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
  params: z.unknown(),
  /** the name the user gave the signal; optional so older hosts still work */
  label: z.string().optional()
})
export type SignalSpec = z.infer<typeof SignalSpecSchema>

/** An HTTP request to the plugin's webhook routes; `path` is below /hook/<instance>. */
export const HttpRequestSchema = z.object({
  method: z.string(),
  path: z.string(),
  /** repeated keys are joined with ", " */
  query: z.record(z.string(), z.string()),
  /** lowercase names; repeated headers are joined with ", "; the session cookie is not forwarded */
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
  // slug: the instance's topic segment and webhook path (/hook/<slug>/…); optional for older hosts
  z.object({
    type: z.literal("init"), instanceId: z.string(), slug: z.string().optional(), config: z.unknown(), store: z.record(z.string(), z.unknown()),
    /** IANA name of the installation's time zone; absent when the host doesn't know it */
    timeZone: z.string().optional()
  }),
  /** what the plugin offers: config schema, sensors and actuators with their params (JSON Schema) */
  z.object({ type: z.literal("describe"), requestId }),
  /** adds and starts a sensor or actuator; the response is ok once its start() resolved */
  z.object({ type: z.literal("signal.add"), requestId, signal: SignalSpecSchema }),
  z.object({ type: z.literal("signal.remove"), requestId, id: z.string() }),
  /** `causeId` is the bus message that triggered it; emits while handling it carry it back */
  z.object({ type: z.literal("actuate"), requestId, signalId: z.string(), value: ValueSchema, causeId: z.string().optional() }),
  /** answered with a CatalogNode[] */
  z.object({ type: z.literal("catalog"), requestId }),
  /** answered with a Panel, or no result when the plugin has none */
  z.object({ type: z.literal("panel"), requestId }),
  /** answered with a full HttpResponse */
  z.object({ type: z.literal("http.request"), requestId, request: HttpRequestSchema }),
  /**
   * The signals the user chose for a plugin that declares `watches`; replaces the previous list.
   * Sent after `ready` and when the choice or a chosen signal changes; never to other plugins.
   */
  z.object({ type: z.literal("watch.signals"), signals: z.array(WatchedSignalSchema).max(100_000) }),
  /** values of watched signals, oldest first; answered with `watch.ack` (seq). `dropped`: values left out since the last batch because the plugin was too slow */
  z.object({ type: z.literal("watch.values"), seq: z.int().nonnegative(), values: z.array(WatchedValueSchema).max(5000), dropped: z.int().nonnegative().optional() }),
  /** liveness probe; the worker echoes `seq` in `pong` */
  z.object({ type: z.literal("ping"), seq: z.int() }),
  /** dispose everything, answer `stopped`; the host terminates the worker after a grace period */
  z.object({ type: z.literal("shutdown") })
])
export type HostMessage = z.infer<typeof HostMessageSchema>
