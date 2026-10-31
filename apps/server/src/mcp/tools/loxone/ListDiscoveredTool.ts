import { DataTypes, type DiscoveredPacketDto } from "@lox-nexus/api"
import { ValueFormatter } from "@lox-nexus/plugin-sdk/values"
import { z } from "zod"
import { CompactTable } from "../../CompactTable.ts"
import type { McpRefs } from "../../McpRefs.ts"
import type { McpTool } from "../../McpTool.ts"

const Input = z.object({ miniserver: z.string().min(1).max(100).describe("the Miniserver's slug") })

/** Packets a Miniserver sends that no signal is set up for: a wrong packet id, or an object to adopt. */
export class ListDiscoveredTool implements McpTool<z.infer<typeof Input>> {
  readonly name = "list_discovered"
  readonly title = "Packets without a signal"
  readonly description = "Packet ids a Miniserver sends that no Nexus signal is set up for, with their data type, last value and when they were seen. A typo in a packet id shows up here; adopt_discovered turns them into signals."
  readonly scope = "read" as const
  readonly annotations = { readOnlyHint: true }
  readonly input = Input
  private readonly values = new ValueFormatter()

  constructor(private readonly refs: McpRefs, private readonly loxoneSignals: { discovered(miniserverId: string): DiscoveredPacketDto[] }) {}

  run(input: z.infer<typeof Input>) {
    const packets = this.loxoneSignals.discovered(this.refs.miniserver(input.miniserver).id)
    if (packets.length === 0) return "no packets without a signal"
    return CompactTable.of(packets, [
      ["packetId", packet => packet.packetId], ["dataType", packet => DataTypes.nameOf(packet.dataType)],
      ["value", packet => this.values.format(packet.value)], ["lastSeen", packet => new Date(packet.lastSeen).toISOString()]
    ])
  }
}
