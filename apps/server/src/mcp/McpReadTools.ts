import type { DiagnosticsDto, HistorySeriesDto } from "@lox-nexus/api"
import type { Recorder } from "@lox-nexus/core"
import type { ChangeLock } from "../http/ChangeLock.ts"
import { InventoryService, type InventorySources } from "../services/InventoryService.ts"
import { McpInstructions } from "./McpInstructions.ts"
import type { McpResource } from "./McpResource.ts"
import type { McpTool } from "./McpTool.ts"
import { GetHistoryTool } from "./tools/GetHistoryTool.ts"
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
  /** HistoryService; get_history is offered with it */
  history?: { series(signalId: string, input: unknown): HistorySeriesDto }
  /** the time, so tools don't read the global clock */
  now?: () => number
}

/** The read tools of A1 and the resources that show the same content (ADR 0020). */
export class McpReadTools {
  readonly tools: McpTool[]
  readonly resources: McpResource[]
  /** shared with the changing tools, which name and count what they touch */
  readonly inventory: InventoryService

  constructor(sources: McpReadSources) {
    const inventory = this.inventory = new InventoryService(sources)
    const now = sources.now ?? (() => Date.now())
    const overview = new OverviewTool(inventory, { version: sources.version, now, ...(sources.lock ? { lock: sources.lock } : {}) })
    this.tools = [
      overview,
      new ListSignalsTool(inventory),
      new GetSignalTool(inventory, sources.recorder),
      new ListWiresTool(inventory),
      new SystemStatusTool(sources.diagnostics, now, sources.lock),
      new RecentMessagesTool(sources.recorder),
      new TraceTool(sources.recorder),
      ...(sources.history ? [new GetHistoryTool(inventory, sources.history, now)] : [])
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
