import { BridgeItemSchema, PluginSignalInputSchema, type BridgeItem, type PluginSignalDto } from "@lox-nexus/api"
import { HttpError } from "../../../http/HttpError.ts"
import { z } from "zod"

/** a catalog entry as search_catalog shows it */
export const EntryInput = PluginSignalInputSchema.pick({ kind: true, capability: true, params: true, label: true })

/** one plugin signal to connect: an existing one by topic, or a catalog entry to add */
export const PluginEndInput = z.union([
  z.object({ signal: z.string().min(1).max(300).describe("an existing signal's topic") }),
  z.object({ entry: EntryInput.describe("a catalog entry from search_catalog, added as a new signal") })
])

/** what bridge takes per item, and plan_bridge answers */
export const BridgeItemInput = z.object({
  plugin: PluginEndInput,
  loxone: BridgeItemSchema.shape.loxone.describe("packetId (≤ 8 ASCII, unique on the Miniserver), dataType (0 Digital, 1 Analog, 2 Text, …), optional label and slug")
})
export type BridgeItemInput = z.infer<typeof BridgeItemInput>

/** Turns the tools' items into the request PluginBridgeService takes. */
export class BridgeItems {
  /** @throws HttpError 404 for a topic the instance has no signal for */
  static resolve(end: z.infer<typeof PluginEndInput>, signals: readonly PluginSignalDto[]): BridgeItem["plugin"] {
    if ("entry" in end) return { type: "new", signal: end.entry }
    const signal = signals.find(entry => entry.topic === end.signal || entry.id === end.signal)
    if (!signal) throw HttpError.notFound(`signal "${end.signal}" of this instance`)
    return { type: "existing", signalId: signal.id }
  }
}
