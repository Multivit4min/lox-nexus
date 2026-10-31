import { BridgeDraft, DataTypes, type BridgeCandidate, type LoxoneSignalDto, type PluginSignalDto, type WireDto } from "@lox-nexus/api"
import { z } from "zod"
import type { McpRefs } from "../../McpRefs.ts"
import type { McpTool } from "../../McpTool.ts"
import { BridgeItems, PluginEndInput, type BridgeItemInput } from "./BridgeItems.ts"
import type { PluginRefs } from "./PluginRefs.ts"

const Input = z.object({
  instance: z.string().min(1).max(100).describe("the plugin instance's slug"),
  miniserver: z.string().min(1).max(100).describe("the Miniserver's slug"),
  items: z.array(PluginEndInput).min(1).max(200).describe("existing signals by topic, or catalog entries to add")
})

/** Suggests the Loxone side for plugin signals: packet ids that are free, data types that fit. Creates nothing. */
export class PlanBridgeTool implements McpTool<z.infer<typeof Input>> {
  readonly name = "plan_bridge"
  readonly title = "Plan a connection to a Miniserver"
  readonly description = "For plugin signals (existing ones by topic, or catalog entries), suggest the Loxone signal each gets: a free packet id, the data type that fits the value, and the direction (a sensor becomes a Nexus out signal, an actuator an in signal). Creates nothing: show the user, adjust, then pass `items` to bridge."
  readonly scope = "read" as const
  readonly annotations = { readOnlyHint: true, idempotentHint: true }
  readonly input = Input

  constructor(
    private readonly refs: PluginRefs,
    private readonly miniservers: Pick<McpRefs, "miniserver">,
    private readonly sources: {
      pluginSignals: { list(instanceId: string): PluginSignalDto[] }
      loxoneSignals: { list(miniserverId: string): LoxoneSignalDto[] }
      wires: { list(): WireDto[] }
    }
  ) {}

  run(input: z.infer<typeof Input>) {
    const instance = this.refs.instance(input.instance)
    const pkg = this.refs.package(instance.plugin)
    const ms = this.miniservers.miniserver(input.miniserver)
    const existing = this.sources.loxoneSignals.list(ms.id)
    const signals = this.sources.pluginSignals.list(instance.id)
    const candidates: BridgeCandidate[] = input.items.map((end, i) => {
      const plugin = BridgeItems.resolve(end, signals)
      if (plugin.type === "existing") return BridgeDraft.fromSignal(signals.find(signal => signal.id === plugin.signalId)!)
      return BridgeDraft.fromEntry(String(i), { ...plugin.signal, params: plugin.signal.params ?? {} }, pkg.description)
    })
    const connected = BridgeDraft.connected(candidates, this.sources.wires.list(), existing)
    const rows = BridgeDraft.rows(candidates, existing.map(signal => signal.packetId))
    const items: BridgeItemInput[] = rows.map((row, i) => ({ plugin: input.items[i]!, loxone: { packetId: row.packetId, dataType: row.dataType, label: row.label } }))
    return {
      miniserver: ms.slug,
      items,
      notes: rows.map(row => ({
        label: row.label,
        kind: row.candidate.kind,
        loxoneDirection: row.candidate.kind === "sensor" ? "out (an intercommunication input in Loxone Config)" : "in (an intercommunication output in Loxone Config)",
        dataTypeName: DataTypes.nameOf(row.dataType),
        ...(connected.has(row.candidate.key) ? { alreadyConnectedTo: connected.get(row.candidate.key) } : {})
      }))
    }
  }
}
