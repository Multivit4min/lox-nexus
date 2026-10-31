import { PluginSignalInputSchema, type PluginSignalDto, type PluginSignalInput } from "@lox-nexus/api"
import { z } from "zod"
import { BulkItems } from "../../BulkItems.ts"
import type { McpTool } from "../../McpTool.ts"
import { SecretInputs } from "../../SecretInputs.ts"
import type { ToolContext } from "../../ToolContext.ts"
import type { PluginRefs } from "./PluginRefs.ts"

/** what the plugin signal tools call: PluginSignalService, as the REST controller does */
export interface PluginSignalWrites {
  list(instanceId: string): PluginSignalDto[]
  add(instanceId: string, input: PluginSignalInput): Promise<PluginSignalDto>
  update(instanceId: string, signalId: string, input: PluginSignalInput, by: string): Promise<PluginSignalDto>
  remove(instanceId: string, signalId: string, by: string): Promise<void>
}

const Add = z.object({
  instance: z.string().min(1).max(100).describe("the instance's slug"),
  signals: z.array(PluginSignalInputSchema).min(1).max(200)
    .describe("kind, capability and params as describe_plugin says (or a search_catalog entry), a label, and optionally slug, unit, decimals, staleAfterMin; no secret params")
})

const Update = PluginSignalInputSchema.pick({ params: true, label: true, slug: true, unit: true, decimals: true, staleAfterMin: true }).partial().extend({
  signal: z.string().min(1).max(300).describe("the signal's topic (or id)"),
  params: z.record(z.string(), z.unknown()).optional().describe("only the top-level params that change; null removes one; secret ones stay as stored")
})

/** Adds sensors or actuators to a plugin instance, item by item; no wire, no Loxone signal (that is bridge). */
export class AddPluginSignalsTool implements McpTool<z.infer<typeof Add>> {
  readonly name = "add_plugin_signals"
  readonly title = "Add plugin signals"
  readonly description = "Add sensors or actuators to a plugin instance (up to 200), each checked by the plugin. Answers each new topic, or why not. To connect them to a Miniserver in the same step, use plan_bridge and bridge instead."
  readonly scope = "configure" as const
  readonly changes = true
  readonly timeoutMs = 120_000
  readonly input = Add

  constructor(private readonly refs: Pick<PluginRefs, "instance" | "package">, private readonly signals: Pick<PluginSignalWrites, "add">) {}

  run(input: z.infer<typeof Add>, context: ToolContext) {
    const instance = this.refs.instance(input.instance)
    const { description } = this.refs.package(instance.plugin)
    return BulkItems.runAsync(input.signals, signal => signal.label || signal.capability, async signal => {
      SecretInputs.refuseParams(description, signal)
      return (await this.signals.add(instance.id, signal)).topic
    }, context)
  }
}

/** Changes one plugin signal: only what is given; secret params stay as stored. */
export class UpdatePluginSignalTool implements McpTool<z.infer<typeof Update>> {
  readonly name = "update_plugin_signal"
  readonly title = "Change a plugin signal"
  readonly description = "Change a plugin signal's label, slug (moves its topic), params (only the top-level ones that change; null removes one), unit, decimals or staleAfterMin. To clear a field, send unit: \"\", decimals: null or staleAfterMin: null. Kind and capability can't change. The plugin checks the params; its wires stay."
  readonly scope = "configure" as const
  readonly changes = true
  readonly annotations = { idempotentHint: true }
  readonly timeoutMs = 60_000
  readonly input = Update

  constructor(private readonly refs: Pick<PluginRefs, "signal" | "package">, private readonly signals: PluginSignalWrites) {}

  async run(input: z.infer<typeof Update>, context: ToolContext) {
    const { instance, signal } = this.refs.signal(input.signal, this.signals)
    const params = Object.fromEntries(Object.entries({ ...(signal.params as Record<string, unknown>), ...input.params }).filter(([, value]) => value !== null))
    SecretInputs.refuseParams(this.refs.package(instance.plugin).description, { ...signal, params: input.params ?? {} })
    const pick = <K extends "label" | "slug" | "unit" | "decimals" | "staleAfterMin">(key: K) => (key in input ? input[key] : signal[key])
    const updated = await this.signals.update(instance.id, signal.id, {
      kind: signal.kind, capability: signal.capability, params,
      label: pick("label") ?? signal.label, slug: pick("slug") ?? signal.slug,
      unit: pick("unit"), decimals: pick("decimals"), staleAfterMin: pick("staleAfterMin")
    }, context.by)
    return { topic: updated.topic, label: updated.label, params: updated.params, ...(updated.topic !== signal.topic ? { movedFrom: signal.topic } : {}) }
  }
}
