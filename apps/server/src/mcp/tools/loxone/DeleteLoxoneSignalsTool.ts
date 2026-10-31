import { z } from "zod"
import type { InventoryService } from "../../../services/InventoryService.ts"
import type { McpRefs } from "../../McpRefs.ts"
import type { McpTool } from "../../McpTool.ts"
import type { ToolContext } from "../../ToolContext.ts"
import { BulkItems } from "../../BulkItems.ts"
import { Counted } from "../../Counted.ts"
import type { LoxoneSignalWrites } from "./LoxoneSignalWrites.ts"

const Input = z.object({
  signals: z.array(z.string().min(1).max(300)).min(1).max(200).describe("topics (or ids) of Loxone signals"),
  confirmation: z.string().max(64).optional().describe("from the first call's answer; without it nothing is deleted")
})

/** Deletes Loxone signals with their wires and forces, after a confirmation that names what goes. */
export class DeleteLoxoneSignalsTool implements McpTool<z.infer<typeof Input>> {
  readonly name = "delete_loxone_signals"
  readonly title = "Delete Loxone signals"
  readonly description = "Delete Loxone signals; their wires, forces and stored values go with them. The first call deletes nothing: it answers what would go and a confirmation; call again with the same signals and that confirmation to delete."
  readonly scope = "configure" as const
  readonly changes = true
  readonly annotations = { destructiveHint: true }
  readonly input = Input

  constructor(private readonly refs: McpRefs, private readonly signals: Pick<LoxoneSignalWrites, "remove">, private readonly inventory: Pick<InventoryService, "impact">) {}

  confirm(input: z.infer<typeof Input>) {
    const found = [...new Map(input.signals.map(ref => this.refs.loxoneSignal(ref).signal).map(signal => [signal.id, signal])).values()]
    const ids = new Set(found.map(signal => signal.id))
    const { wires, forces } = this.inventory.impact(ids)
    const summary = `deletes ${Counted.of(found.length, "Loxone signal")} (${found.map(signal => signal.topic).join(", ")}), ${Counted.of(wires, "wire")}${forces ? ` and ${Counted.of(forces, "force")}` : ""}; the objects in Loxone Config stay`
    return { summary, bind: [...ids].sort() }
  }

  run(input: z.infer<typeof Input>, context: ToolContext) {
    return BulkItems.run([...new Set(input.signals)], ref => ref, ref => {
      const { miniserver, signal } = this.refs.loxoneSignal(ref)
      this.signals.remove(miniserver.id, signal.id, context.by)
      return signal.topic
    }, context)
  }
}
