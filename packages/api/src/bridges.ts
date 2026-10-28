import { z } from "zod"
import { LoxoneSignalInputSchema, type LoxoneSignalDto } from "./miniservers.ts"
import { PluginSignalInputSchema, type PluginSignalDto } from "./plugins.ts"
import type { WireDto } from "./signals.ts"

/**
 * One plugin signal to connect to a Miniserver: an existing signal of the instance, or a new one
 * (e.g. a catalog entry). A sensor gets a Loxone output (Nexus sends its values to the Miniserver),
 * an actuator a Loxone input (the Miniserver controls it); the direction follows from the kind.
 */
export const BridgeItemSchema = z.object({
  plugin: z.discriminatedUnion("type", [
    z.object({ type: z.literal("existing"), signalId: z.string().min(1) }),
    z.object({ type: z.literal("new"), signal: PluginSignalInputSchema })
  ]),
  loxone: LoxoneSignalInputSchema.pick({ packetId: true, dataType: true, slug: true }).extend({
    /** defaults to the plugin signal's name */
    label: LoxoneSignalInputSchema.shape.label.optional()
  })
})
export type BridgeItem = z.input<typeof BridgeItemSchema>

/** POST /api/plugin-instances/:id/bridge */
export const BridgeRequestSchema = z.object({
  miniserverId: z.string().min(1),
  // each item waits for the plugin, so a hanging one would hold a long list for minutes
  items: z.array(BridgeItemSchema).min(1).max(200)
})
export type BridgeRequest = z.input<typeof BridgeRequestSchema>

/**
 * What became of one item, in request order. What a failed item had created (a new plugin signal,
 * the Loxone signal) is removed again; `leftover` names what couldn't be (the server logs why).
 */
export type BridgeResultDto =
  | { ok: true; signal: PluginSignalDto; loxone: LoxoneSignalDto; wire: WireDto }
  | { ok: false; label: string; error: string; leftover?: string[] }
