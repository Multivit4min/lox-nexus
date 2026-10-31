import { AdoptPacketSchema } from "@lox-nexus/api"
import { z } from "zod"
import type { McpRefs } from "../../McpRefs.ts"
import type { McpTool } from "../../McpTool.ts"
import type { ToolContext } from "../../ToolContext.ts"
import { BulkItems, type LoxoneSignalWrites } from "./LoxoneSignalWrites.ts"

const Input = z.object({
  miniserver: z.string().min(1).max(100).describe("the Miniserver's slug"),
  packets: z.array(AdoptPacketSchema).min(1).max(200).describe("packet ids from list_discovered, each with an optional label and slug")
})

/** Turns packets a Miniserver sends without a signal into input signals of the type they came with. */
export class AdoptDiscoveredTool implements McpTool<z.infer<typeof Input>> {
  readonly name = "adopt_discovered"
  readonly title = "Adopt discovered packets"
  readonly description = "Turn packets from list_discovered into signals (direction in, the data type they arrived with), each with an optional label and slug. Answers each new topic, or why not."
  readonly scope = "configure" as const
  readonly changes = true
  readonly input = Input

  constructor(private readonly refs: McpRefs, private readonly signals: Pick<LoxoneSignalWrites, "adopt">) {}

  run(input: z.infer<typeof Input>, context: ToolContext) {
    const ms = this.refs.miniserver(input.miniserver)
    return BulkItems.run(input.packets, packet => packet.packetId, packet => this.signals.adopt(ms.id, packet, context.by).topic)
  }
}
