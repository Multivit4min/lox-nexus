import { z } from "zod"
import type { InventoryService } from "../../../services/InventoryService.ts"
import type { McpTool } from "../../McpTool.ts"
import type { ToolContext } from "../../ToolContext.ts"
import type { PluginRefs } from "../plugins/PluginRefs.ts"
import type { InstanceWrites } from "./InstanceWrites.ts"

const Input = z.object({
  instance: z.string().min(1).max(100).describe("the instance's slug"),
  confirmation: z.string().max(64).optional().describe("from the first call's answer; without it nothing is deleted")
})

/** Deletes a plugin instance with its signals, wires and stored data, after a confirmation that counts them. */
export class DeleteInstanceTool implements McpTool<z.infer<typeof Input>> {
  readonly name = "delete_plugin_instance"
  readonly title = "Delete a plugin instance"
  readonly description = "Delete a plugin instance with its signals, their wires and forces, and the data it stored (e.g. a Matter bridge's pairings). The first call deletes nothing: it answers what would go and a confirmation; call again with it to delete. To pause it instead, plugin_instance_lifecycle stop."
  readonly scope = "configure" as const
  readonly changes = true
  readonly annotations = { destructiveHint: true }
  readonly input = Input

  constructor(private readonly refs: Pick<PluginRefs, "instance">, private readonly instances: Pick<InstanceWrites, "remove">, private readonly inventory: Pick<InventoryService, "signals" | "wires">) {}

  confirm(input: z.infer<typeof Input>) {
    const instance = this.refs.instance(input.instance)
    const signals = this.inventory.signals().filter(signal => signal.owner === `plugin:${instance.slug}`)
    const ids = new Set(signals.map(signal => signal.id))
    const wires = this.inventory.wires().filter(wire => ids.has(wire.sourceId) || ids.has(wire.targetId)).length
    return { summary: `deletes the ${instance.plugin} instance "${instance.label}" (${instance.slug}) with ${signals.length} signals, ${wires} wires, its forces and everything it stored; the plugin stays installed`, bind: instance.id }
  }

  async run(input: z.infer<typeof Input>, context: ToolContext) {
    const instance = this.refs.instance(input.instance)
    await this.instances.remove(instance.id, context.by)
    return { deleted: instance.slug }
  }
}
