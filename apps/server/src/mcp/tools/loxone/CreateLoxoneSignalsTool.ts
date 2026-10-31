import { LoxoneSignalInputSchema } from "@lox-nexus/api"
import { z } from "zod"
import type { McpRefs } from "../../McpRefs.ts"
import type { McpTool } from "../../McpTool.ts"
import { BulkItems, type LoxoneSignalWrites } from "./LoxoneSignalWrites.ts"

const Input = z.object({
  miniserver: z.string().min(1).max(100).describe("the Miniserver's slug"),
  signals: z.array(LoxoneSignalInputSchema).min(1).max(200)
    .describe("each with packetId (≤ 8 ASCII, unique per direction), direction (in: the Miniserver sends; out: Nexus sends), dataType (0 Digital, 1 Analog, 2 Text, 3 T5, 4 Smart RGBW, 5 Smart single channel, 6 Smart tunable white), label, and optionally slug, unit, decimals")
})

/** Adds Loxone signals to a Miniserver, item by item. */
export class CreateLoxoneSignalsTool implements McpTool<z.infer<typeof Input>> {
  readonly name = "create_loxone_signals"
  readonly title = "Add Loxone signals"
  readonly description = "Add Loxone signals to a Miniserver (up to 200). Each answers its new topic, or why it was refused (a packet id or topic that exists already), so fix only those. The matching objects in Loxone Config come from loxone_side."
  readonly scope = "configure" as const
  readonly changes = true
  readonly input = Input

  constructor(private readonly refs: McpRefs, private readonly signals: Pick<LoxoneSignalWrites, "add">) {}

  run(input: z.infer<typeof Input>) {
    const ms = this.refs.miniserver(input.miniserver)
    return BulkItems.run(input.signals, signal => `${signal.direction}:${signal.packetId}`, signal => this.signals.add(ms.id, signal).topic)
  }
}
