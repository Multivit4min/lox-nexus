import { z } from "zod"
import type { InventoryService } from "../../../services/InventoryService.ts"
import type { McpRefs } from "../../McpRefs.ts"
import { Counted } from "../../Counted.ts"
import type { McpTool } from "../../McpTool.ts"
import type { ToolContext } from "../../ToolContext.ts"
import type { MiniserverWrites } from "./MiniserverWrites.ts"

const Input = z.object({
  miniserver: z.string().min(1).max(100).describe("the Miniserver's slug"),
  confirmation: z.string().max(64).optional().describe("from the first call's answer; without it nothing is deleted")
})

/** Deletes a Miniserver with its signals, their wires and forces, after a confirmation that counts them. */
export class DeleteMiniserverTool implements McpTool<z.infer<typeof Input>> {
  readonly name = "delete_miniserver"
  readonly title = "Delete a Miniserver"
  readonly description = "Delete a Miniserver with all its Loxone signals, their wires, forces and stored values. The first call deletes nothing: it answers what would go and a confirmation; call again with it to delete. To pause it instead, stop_miniserver."
  readonly scope = "configure" as const
  readonly changes = true
  readonly annotations = { destructiveHint: true }
  readonly input = Input

  constructor(
    private readonly refs: Pick<McpRefs, "miniserver">,
    private readonly miniservers: Pick<MiniserverWrites, "remove">,
    private readonly inventory: Pick<InventoryService, "signals" | "impact">
  ) {}

  confirm(input: z.infer<typeof Input>) {
    const ms = this.refs.miniserver(input.miniserver)
    const all = this.inventory.signals()
    const signals = all.filter(signal => signal.owner === `miniserver:${ms.slug}`)
    const { wires, forces } = this.inventory.impact(new Set(signals.map(signal => signal.id)), all)
    const summary = `deletes the Miniserver "${ms.label}" (${ms.slug}) with ${Counted.of(signals.length, "Loxone signal")}, ${Counted.of(wires, "wire")} and ${Counted.of(forces, "force")}; Loxone Config is not changed`
    return { summary, bind: ms.id }
  }

  async run(input: z.infer<typeof Input>, context: ToolContext) {
    const ms = this.refs.miniserver(input.miniserver)
    await this.miniservers.remove(ms.id, context.by)
    return { deleted: ms.slug }
  }
}
