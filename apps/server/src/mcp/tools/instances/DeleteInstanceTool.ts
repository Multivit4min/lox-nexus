import { z } from "zod"
import type { InventoryService } from "../../../services/InventoryService.ts"
import type { McpTool } from "../../McpTool.ts"
import { Counted } from "../../Counted.ts"
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

  constructor(private readonly refs: Pick<PluginRefs, "instance">, private readonly instances: Pick<InstanceWrites, "remove">, private readonly inventory: Pick<InventoryService, "signals" | "impact">) {}

  confirm(input: z.infer<typeof Input>) {
    const instance = this.refs.instance(input.instance)
    const all = this.inventory.signals()
    const signals = all.filter(signal => signal.owner === `plugin:${instance.slug}`)
    const { wires, forces } = this.inventory.impact(new Set(signals.map(signal => signal.id)), all)
    const summary = `deletes the ${instance.plugin} instance "${instance.label}" (${instance.slug}) with ${Counted.of(signals.length, "signal")}, ${Counted.of(wires, "wire")}, ${Counted.of(forces, "force")} and everything it stored; the plugin stays installed`
    return { summary, bind: instance.id }
  }

  async run(input: z.infer<typeof Input>, context: ToolContext) {
    const instance = this.refs.instance(input.instance)
    await this.instances.remove(instance.id, context.by)
    return { deleted: instance.slug }
  }
}
