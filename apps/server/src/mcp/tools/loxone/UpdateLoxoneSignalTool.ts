import { LoxoneSignalInputSchema } from "@lox-nexus/api"
import { z } from "zod"
import type { McpRefs } from "../../McpRefs.ts"
import type { McpTool } from "../../McpTool.ts"
import type { ToolContext } from "../../ToolContext.ts"
import type { LoxoneSignalWrites } from "./LoxoneSignalWrites.ts"

const Input = LoxoneSignalInputSchema.partial().extend({
  signal: z.string().min(1).max(300).describe("the signal's topic (or id)")
})

/** Changes one Loxone signal: only the fields given, the rest stays. */
export class UpdateLoxoneSignalTool implements McpTool<z.infer<typeof Input>> {
  readonly name = "update_loxone_signal"
  readonly title = "Change a Loxone signal"
  readonly description = "Change a Loxone signal: give only what changes (label, packetId, direction, dataType, slug, unit, decimals, staleAfterMin). A new label keeps the topic; a new slug moves the topic, as does a new packet id or direction for a signal without a slug (movedFrom names the old one); its value and force move along, its wires stay. To clear a field, send unit: \"\", decimals: null or staleAfterMin: null. A new packet id, direction or data type must be changed in Loxone Config too (loxone_side)."
  readonly scope = "configure" as const
  readonly changes = true
  readonly annotations = { idempotentHint: true }
  readonly input = Input

  constructor(private readonly refs: McpRefs, private readonly signals: Pick<LoxoneSignalWrites, "update">) {}

  run(input: z.infer<typeof Input>, context: ToolContext) {
    const { signal: ref, ...changes } = input
    const { miniserver, signal } = this.refs.loxoneSignal(ref)
    const { packetId, direction, dataType, label, slug, unit, decimals, staleAfterMin } = signal
    const current = { packetId, direction, dataType, label, slug, unit, decimals, staleAfterMin }
    const merged = LoxoneSignalInputSchema.parse(Object.fromEntries(Object.entries({ ...current, ...changes }).filter(([, value]) => value !== undefined)))
    const updated = this.signals.update(miniserver.id, signal.id, merged, context.by)
    return { topic: updated.topic, label: updated.label, packetId: updated.packetId, direction: updated.direction, dataType: updated.dataType, ...(updated.topic !== signal.topic ? { movedFrom: signal.topic } : {}) }
  }
}
