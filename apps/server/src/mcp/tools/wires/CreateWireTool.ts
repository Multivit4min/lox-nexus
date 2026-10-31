import { z } from "zod"
import type { McpTool } from "../../McpTool.ts"
import { TransformsInput, type WireWrites } from "./WireWrites.ts"
import type { WireRefs } from "./WireRefs.ts"

const Input = z.object({
  source: z.string().min(1).max(300).describe("the topic (or id) whose values the wire carries"),
  target: z.string().min(1).max(300).describe("the topic (or id) that receives them; it may have no wire yet"),
  label: z.string().max(200).optional().describe("default: the two labels"),
  transforms: TransformsInput.optional(),
  enabled: z.boolean().optional(),
  syncOnStart: z.boolean().optional().describe("also forward the value restored at startup, not only live changes")
})

/** Connects two signals: values of the source reach the target, through the transforms. */
export class CreateWireTool implements McpTool<z.infer<typeof Input>> {
  readonly name = "create_wire"
  readonly title = "Create a wire"
  readonly description = "Connect two signals: the source's values reach the target, through optional transforms, converted to the target's type. A target takes one wire; a Miniserver target gets the source's current value at once. Try the transforms with preview_wire first when unsure."
  readonly scope = "configure" as const
  readonly changes = true
  readonly input = Input

  constructor(private readonly refs: WireRefs, private readonly wires: Pick<WireWrites, "create">) {}

  run(input: z.infer<typeof Input>) {
    const source = this.refs.signal(input.source)
    const target = this.refs.signal(input.target)
    const wire = this.wires.create({
      label: input.label ?? `${source.label} → ${target.label}`.slice(0, 200),
      sourceId: source.id,
      targetId: target.id,
      transforms: input.transforms ?? [],
      ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
      ...(input.syncOnStart === undefined ? {} : { syncOnStart: input.syncOnStart })
    })
    return { id: wire.id, label: wire.label, source: source.topic, target: target.topic, active: wire.active }
  }
}
