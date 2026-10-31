import type { LoxoneSignalDto } from "@lox-nexus/api"
import { z } from "zod"
import type { InventoryService } from "../../../services/InventoryService.ts"
import { LoxoneSideDescriptor } from "../../../services/LoxoneSideDescriptor.ts"
import type { McpRefs } from "../../McpRefs.ts"
import type { McpTool } from "../../McpTool.ts"

const Input = z.object({
  miniserver: z.string().min(1).max(100).describe("the Miniserver's slug, as overview names it"),
  signals: z.array(z.string().max(300)).max(500).optional().describe("only these Loxone signals (topics); default all of the Miniserver"),
  nexusAddress: z.string().max(253).optional().describe("the address the Miniserver reaches Nexus at, if the user told you; Nexus can't tell behind Docker")
})

/** What to create in Loxone Config: the peer under the Network Intercommunication, and one object per signal. */
export class LoxoneSideTool implements McpTool<z.infer<typeof Input>> {
  readonly name = "loxone_side"
  readonly title = "What Loxone Config needs"
  readonly description = "For a Miniserver: the peer device to create under its Network Intercommunication in Loxone Config (ICI ids, ports, address, encryption) and, per Loxone signal, the object: an intercommunication input for Nexus out signals, an output for in signals, with name, packet id, data type, a description naming the Nexus topic, and a unit format. Packet id, direction and data type must match exactly; names are free."
  readonly scope = "read" as const
  readonly annotations = { readOnlyHint: true, idempotentHint: true }
  readonly input = Input

  constructor(private readonly refs: McpRefs, private readonly loxoneSignals: { list(miniserverId: string): LoxoneSignalDto[] }, private readonly inventory: Pick<InventoryService, "signals" | "wires">) {}

  run(input: z.infer<typeof Input>) {
    const ms = this.refs.miniserver(input.miniserver)
    const wanted = input.signals ? new Set(input.signals) : undefined
    const signals = this.loxoneSignals.list(ms.id).filter(signal => !wanted || wanted.has(signal.topic) || wanted.has(signal.id))
    const topics = new Map(this.inventory.signals().map(signal => [signal.id, signal.topic]))
    const feeds = new Map<string, string>()
    for (const wire of this.inventory.wires()) {
      feeds.set(wire.targetId, topics.get(wire.sourceId) ?? wire.sourceId)
      if (!feeds.has(wire.sourceId)) feeds.set(wire.sourceId, topics.get(wire.targetId) ?? wire.targetId)
    }
    const notFound = input.signals?.filter(ref => !signals.some(signal => signal.topic === ref || signal.id === ref)) ?? []
    return { ...LoxoneSideDescriptor.describe(ms, signals, feeds, input.nexusAddress), ...(notFound.length ? { notFound } : {}) }
  }
}
