import { z } from "zod"
import type { InventoryService } from "../../../services/InventoryService.ts"
import { BulkItems } from "../../BulkItems.ts"
import type { McpTool } from "../../McpTool.ts"
import type { ToolContext } from "../../ToolContext.ts"
import type { PluginRefs } from "./PluginRefs.ts"
import type { PluginSignalWrites } from "./PluginSignalTools.ts"

const Input = z.object({
  signals: z.array(z.string().min(1).max(300)).min(1).max(200).describe("topics (or ids) of plugin signals"),
  confirmation: z.string().max(64).optional().describe("from the first call's answer; without it nothing is deleted")
})

/** Deletes plugin signals with their wires and forces, after a confirmation that names what goes. */
export class DeletePluginSignalsTool implements McpTool<z.infer<typeof Input>> {
  readonly name = "delete_plugin_signals"
  readonly title = "Delete plugin signals"
  readonly description = "Delete sensors or actuators of plugin instances; their wires, forces and stored values go with them. The first call deletes nothing: it answers what would go and a confirmation; call again with the same signals and it to delete."
  readonly scope = "configure" as const
  readonly changes = true
  readonly annotations = { destructiveHint: true }
  readonly input = Input

  constructor(private readonly refs: Pick<PluginRefs, "signal">, private readonly signals: Pick<PluginSignalWrites, "list" | "remove">, private readonly inventory: Pick<InventoryService, "signals" | "wires">) {}

  confirm(input: z.infer<typeof Input>) {
    const found = [...new Map(input.signals.map(ref => this.refs.signal(ref, this.signals).signal).map(signal => [signal.id, signal])).values()]
    const ids = new Set(found.map(signal => signal.id))
    const wires = this.inventory.wires().filter(wire => ids.has(wire.sourceId) || ids.has(wire.targetId)).length
    const forces = this.inventory.signals().filter(signal => ids.has(signal.id) && signal.forced).length
    const summary = `deletes ${found.length} plugin signal${found.length === 1 ? "" : "s"} (${found.map(signal => signal.topic).join(", ")}), ${wires} wire${wires === 1 ? "" : "s"}${forces ? ` and ${forces} force${forces === 1 ? "" : "s"}` : ""}`
    return { summary, bind: [...ids].sort() }
  }

  run(input: z.infer<typeof Input>, context: ToolContext) {
    // a topic and the id of the same signal name it twice; it goes once
    const deleted = new Map<string, string>()
    return BulkItems.runAsync([...new Set(input.signals)], ref => ref, async ref => {
      const done = [...deleted].find(([id]) => id === ref || deleted.get(id) === ref)
      if (done) return done[1]
      const { instance, signal } = this.refs.signal(ref, this.signals)
      await this.signals.remove(instance.id, signal.id, context.by)
      deleted.set(signal.id, signal.topic)
      return signal.topic
    }, context)
  }
}
