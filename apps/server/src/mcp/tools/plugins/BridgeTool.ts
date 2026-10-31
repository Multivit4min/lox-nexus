import type { BridgeRequest, BridgeResultDto, PluginSignalDto } from "@lox-nexus/api"
import { z } from "zod"
import type { McpRefs } from "../../McpRefs.ts"
import type { McpTool } from "../../McpTool.ts"
import type { ToolContext } from "../../ToolContext.ts"
import { BridgeItemInput, BridgeItems } from "./BridgeItems.ts"
import type { PluginRefs } from "./PluginRefs.ts"

const Input = z.object({
  instance: z.string().min(1).max(100).describe("the plugin instance's slug"),
  miniserver: z.string().min(1).max(100).describe("the Miniserver's slug"),
  items: z.array(BridgeItemInput).min(1).max(200).describe("as plan_bridge answers them, adjusted as the user wants")
})

/** Connects plugin signals to a Miniserver: the plugin signal, a Loxone signal and the wire, per item. */
export class BridgeTool implements McpTool<z.infer<typeof Input>> {
  readonly name = "bridge"
  readonly title = "Connect plugin signals to a Miniserver"
  readonly description = "Per item: add the plugin signal (for a catalog entry), a Loxone signal for it and the wire between them. A sensor's value is sent to the Miniserver at once. Items are independent: a failed one is undone completely and named with the reason. Afterwards, loxone_side says what to create in Loxone Config."
  readonly scope = "configure" as const
  readonly changes = true
  // each item waits for the plugin to accept its signal
  readonly timeoutMs = 120_000
  readonly input = Input

  constructor(
    private readonly refs: PluginRefs,
    private readonly miniservers: Pick<McpRefs, "miniserver">,
    private readonly pluginSignals: { list(instanceId: string): PluginSignalDto[] },
    private readonly bridges: { bridge(instanceId: string, input: BridgeRequest, by: string): Promise<BridgeResultDto[]> }
  ) {}

  async run(input: z.infer<typeof Input>, context: ToolContext) {
    const instance = this.refs.instance(input.instance)
    const { description } = this.refs.package(instance.plugin)
    const ms = this.miniservers.miniserver(input.miniserver)
    const signals = this.pluginSignals.list(instance.id)
    const items = input.items.map(item => ({ plugin: BridgeItems.resolve(item.plugin, signals, description), loxone: item.loxone }))
    const results = await this.bridges.bridge(instance.id, { miniserverId: ms.id, items }, context.by)
    return results.map(result => result.ok
      ? { ok: true, plugin: result.signal.topic, loxone: result.loxone.topic, packetId: result.loxone.packetId, wire: result.wire.label }
      : { ok: false, label: result.label, error: result.error, ...(result.leftover ? { leftover: result.leftover } : {}) })
  }
}
