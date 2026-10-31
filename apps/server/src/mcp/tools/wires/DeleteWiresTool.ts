import { z } from "zod"
import type { McpTool } from "../../McpTool.ts"
import { BulkItems } from "../../BulkItems.ts"
import { Counted } from "../../Counted.ts"
import type { ToolContext } from "../../ToolContext.ts"
import type { WireRefs } from "./WireRefs.ts"
import type { WireWrites } from "./WireWrites.ts"

const Input = z.object({
  wires: z.array(z.string().min(1).max(300)).min(1).max(200).describe("ids of wires, or their targets' topics"),
  confirmation: z.string().max(64).optional().describe("from the first call's answer; without it nothing is deleted")
})

/** Deletes wires after a confirmation that names them; the signals stay. */
export class DeleteWiresTool implements McpTool<z.infer<typeof Input>> {
  readonly name = "delete_wires"
  readonly title = "Delete wires"
  readonly description = "Delete wires; both signals stay, the target keeps its last value. The first call deletes nothing: it names what would go and answers a confirmation; call again with the same wires and that confirmation to delete. To pause a wire instead, update_wire with enabled: false."
  readonly scope = "configure" as const
  readonly changes = true
  readonly annotations = { destructiveHint: true }
  readonly input = Input

  constructor(private readonly refs: WireRefs, private readonly wires: Pick<WireWrites, "delete">) {}

  confirm(input: z.infer<typeof Input>) {
    const found = [...new Map(input.wires.map(ref => this.refs.wire(ref)).map(wire => [wire.id, wire])).values()]
    return {
      summary: `deletes ${Counted.of(found.length, "wire")}: ${found.map(wire => this.refs.describe(wire)).join("; ")}`,
      bind: found.map(wire => wire.id).sort()
    }
  }

  run(input: z.infer<typeof Input>, context: ToolContext) {
    return BulkItems.run([...new Set(input.wires)], ref => ref, ref => {
      const wire = this.refs.wire(ref)
      this.wires.delete(wire.id)
      return this.refs.describe(wire)
    }, context)
  }
}
