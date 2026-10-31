import type { DiagnosticsDto } from "@lox-nexus/api"
import type { Recorder } from "@lox-nexus/core"
import type { ChangeLock } from "../http/ChangeLock.ts"
import { InventoryService, type InventorySources } from "../services/InventoryService.ts"
import { McpInstructions } from "./McpInstructions.ts"
import type { McpResource } from "./McpResource.ts"
import type { McpTool } from "./McpTool.ts"
import { GetSignalTool } from "./tools/GetSignalTool.ts"
import { ListSignalsTool } from "./tools/ListSignalsTool.ts"
import { ListWiresTool } from "./tools/ListWiresTool.ts"
import { OverviewTool } from "./tools/OverviewTool.ts"
import { RecentMessagesTool } from "./tools/RecentMessagesTool.ts"
import { SystemStatusTool } from "./tools/SystemStatusTool.ts"
import { TraceTool } from "./tools/TraceTool.ts"

/** what the read tools look at */
export interface McpReadSources extends InventorySources {
  recorder: Pick<Recorder, "recent" | "trace">
  diagnostics?: { snapshot(since?: number): DiagnosticsDto }
  lock?: Pick<ChangeLock, "heldBy">
  version: string
}

/** The read tools of A1 and the resources that show the same content (ADR 0020). */
export class McpReadTools {
  readonly tools: McpTool[]
  readonly resources: McpResource[]

  constructor(sources: McpReadSources) {
    const inventory = new InventoryService(sources)
    const overview = new OverviewTool(inventory, { version: sources.version, ...(sources.lock ? { lock: sources.lock } : {}) })
    this.tools = [
      overview,
      new ListSignalsTool(inventory),
      new GetSignalTool(inventory, sources.recorder),
      new ListWiresTool(inventory),
      new SystemStatusTool(sources.diagnostics, sources.lock),
      new RecentMessagesTool(sources.recorder),
      new TraceTool(sources.recorder)
    ]
    this.resources = [
      {
        uri: "nexus://inventory", name: "inventory", title: "Inventory of this installation", mimeType: "application/json", scope: "read",
        description: "What the overview tool answers with signals: true; attach it so the whole installation is in context.",
        read: () => overview.run({ signals: true })
      },
      {
        uri: "nexus://guide", name: "guide", title: "How to work with Lox Nexus", mimeType: "text/markdown", scope: "read",
        description: "The vocabulary, the directions on both sides of a Loxone signal, and which tool answers what.",
        read: () => McpInstructions.GUIDE
      }
    ]
  }
}
