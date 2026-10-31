import { z } from "zod"
import { HttpError } from "../../../http/HttpError.ts"
import type { McpTool } from "../../McpTool.ts"
import { TransformsInput, type WireWrites } from "./WireWrites.ts"
import type { WireRefs } from "./WireRefs.ts"

const Input = z.object({
  wire: z.string().min(1).max(300).describe("the wire's id, or its target's topic"),
  source: z.string().min(1).max(300).optional().describe("a new source (topic or id)"),
  target: z.string().min(1).max(300).optional().describe("a new target (topic or id)"),
  label: z.string().max(200).optional(),
  transforms: TransformsInput.optional().describe("replaces all steps; [] removes them"),
  enabled: z.boolean().optional(),
  syncOnStart: z.boolean().optional()
})

/** Changes one wire: only the fields given, the rest stays. */
export class UpdateWireTool implements McpTool<z.infer<typeof Input>> {
  readonly name = "update_wire"
  readonly title = "Change a wire"
  readonly description = "Change a wire: give only what changes. transforms replaces all steps. enabled: false keeps the wire but stops it carrying values. If the change is refused, the old wire keeps running."
  readonly scope = "configure" as const
  readonly changes = true
  readonly annotations = { idempotentHint: true }
  readonly input = Input

  constructor(private readonly refs: WireRefs, private readonly wires: Pick<WireWrites, "update">) {}

  run(input: z.infer<typeof Input>) {
    const current = this.refs.wire(input.wire)
    if (current.transforms.some(step => step.op === "unsupported") && !input.transforms) {
      throw HttpError.badRequest("the wire has steps this version can't run; give transforms to replace them")
    }
    const signals = this.refs.signals()
    const source = input.source === undefined ? undefined : this.refs.signal(input.source, signals)
    const target = input.target === undefined ? undefined : this.refs.signal(input.target, signals)
    const label = (id: string) => signals.find(signal => signal.id === id)?.label ?? id
    // a label made from the two ends follows them; one the user chose stays
    const automatic = current.label === `${label(current.sourceId)} → ${label(current.targetId)}`
    const sourceId = source?.id ?? current.sourceId
    const targetId = target?.id ?? current.targetId
    const updated = this.wires.update(current.id, {
      label: input.label ?? (automatic ? `${label(sourceId)} → ${label(targetId)}`.slice(0, 200) : current.label),
      sourceId,
      targetId,
      transforms: input.transforms ?? current.transforms,
      enabled: input.enabled ?? current.enabled,
      syncOnStart: input.syncOnStart ?? current.syncOnStart
    })
    return { id: updated.id, label: updated.label, wire: this.refs.describe(updated), transforms: updated.transforms.map(step => step.op), enabled: updated.enabled, active: updated.active }
  }
}
