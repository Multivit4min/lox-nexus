import { ValueSchema } from "@lox-nexus/plugin-sdk/values"
import { z } from "zod"
import type { McpTool } from "../../McpTool.ts"
import { TransformsInput, type WireWrites } from "./WireWrites.ts"
import type { WireRefs } from "./WireRefs.ts"

const Input = z.object({
  value: ValueSchema.describe("a sample value, e.g. {type:\"number\", value:21.5}"),
  transforms: TransformsInput,
  target: z.string().max(300).optional().describe("a topic: adds the conversion to its type, as the wire would deliver it")
})

/** What a wire would make of a value, step by step; nothing is created. */
export class PreviewWireTool implements McpTool<z.infer<typeof Input>> {
  readonly name = "preview_wire"
  readonly title = "Try transforms"
  readonly description = "What transforms make of a sample value, after each step, and what a target would receive. Creates nothing; invalid steps answer with the path of the faulty field."
  readonly scope = "read" as const
  readonly annotations = { readOnlyHint: true, idempotentHint: true }
  readonly input = Input

  constructor(private readonly refs: WireRefs, private readonly wires: Pick<WireWrites, "preview">) {}

  run(input: z.infer<typeof Input>) {
    const target = input.target === undefined ? undefined : this.refs.signal(input.target).id
    return this.wires.preview({ value: input.value, transforms: input.transforms, ...(target ? { targetId: target } : {}) })
  }
}
