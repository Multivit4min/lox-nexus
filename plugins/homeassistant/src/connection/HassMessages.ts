import { z } from "@lox-nexus/plugin-sdk"

/**
 * What Home Assistant sends over its WebSocket API, checked loosely: only the fields Nexus reads.
 * https://developers.home-assistant.io/docs/api/websocket
 */
export const InboundMessageSchema = z.object({
  type: z.string(),
  id: z.number().optional(),
  success: z.boolean().optional(),
  result: z.unknown().optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
  event: z.unknown().optional(),
  ha_version: z.string().optional(),
  message: z.string().optional()
})
export type InboundMessage = z.infer<typeof InboundMessageSchema>

const attributes = z.record(z.string(), z.unknown())

/** one entity in the compressed `subscribe_entities` format: s = state, a = attributes, lc = last changed (s) */
const CompressedStateSchema = z.object({ s: z.string(), a: attributes.default({}), lc: z.number().optional() })

/** a change: "+" sets the state or merges attributes, "-" removes attributes */
const CompressedDiffSchema = z.object({
  "+": z.object({ s: z.string().optional(), a: attributes.optional(), lc: z.number().optional() }).optional(),
  "-": z.object({ a: z.array(z.string()).optional() }).optional()
})

/** An event of `subscribe_entities`: the first one adds every entity, later ones change or remove some. */
export const EntitiesEventSchema = z.object({
  a: z.record(z.string(), CompressedStateSchema).optional(),
  c: z.record(z.string(), CompressedDiffSchema).optional(),
  r: z.array(z.string()).optional()
})
export type EntitiesEvent = z.infer<typeof EntitiesEventSchema>

/** An event of `subscribe_events`, e.g. a `zha_event` with the button's command in its data. */
export const BusEventSchema = z.object({
  event_type: z.string(),
  data: z.record(z.string(), z.unknown()).default({})
})
