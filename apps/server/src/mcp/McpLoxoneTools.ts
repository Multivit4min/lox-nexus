import type { DiscoveredPacketDto, MiniserverDto } from "@lox-nexus/api"
import type { InventoryService } from "../services/InventoryService.ts"
import { McpRefs } from "./McpRefs.ts"
import type { McpTool } from "./McpTool.ts"
import { AdoptDiscoveredTool } from "./tools/loxone/AdoptDiscoveredTool.ts"
import { CreateLoxoneSignalsTool } from "./tools/loxone/CreateLoxoneSignalsTool.ts"
import { DeleteLoxoneSignalsTool } from "./tools/loxone/DeleteLoxoneSignalsTool.ts"
import { DiffLoxoneObjectsTool } from "./tools/loxone/DiffLoxoneObjectsTool.ts"
import { ListDiscoveredTool } from "./tools/loxone/ListDiscoveredTool.ts"
import type { LoxoneSignalWrites } from "./tools/loxone/LoxoneSignalWrites.ts"
import { LoxoneSideTool } from "./tools/loxone/LoxoneSideTool.ts"
import { UpdateLoxoneSignalTool } from "./tools/loxone/UpdateLoxoneSignalTool.ts"

/** what the Loxone tools read and change */
export interface McpLoxoneSources {
  miniservers: { list(): MiniserverDto[] }
  loxoneSignals: LoxoneSignalWrites & { discovered(miniserverId: string): DiscoveredPacketDto[] }
  inventory: Pick<InventoryService, "signals" | "wires">
}

/** The Loxone side of A2 (ADR 0020): both halves of a signal, and the changes to the Nexus half. */
export class McpLoxoneTools {
  readonly tools: McpTool[]
  readonly refs: McpRefs

  constructor({ miniservers, loxoneSignals, inventory }: McpLoxoneSources) {
    const refs = this.refs = new McpRefs({ miniservers, loxoneSignals })
    this.tools = [
      new LoxoneSideTool(refs, loxoneSignals, inventory),
      new ListDiscoveredTool(refs, loxoneSignals),
      new DiffLoxoneObjectsTool(refs, loxoneSignals),
      new CreateLoxoneSignalsTool(refs, loxoneSignals),
      new UpdateLoxoneSignalTool(refs, loxoneSignals),
      new DeleteLoxoneSignalsTool(refs, loxoneSignals, inventory),
      new AdoptDiscoveredTool(refs, loxoneSignals)
    ]
  }
}
