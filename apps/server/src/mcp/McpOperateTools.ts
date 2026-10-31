import type { PluginActionResultDto } from "@lox-nexus/api"
import type { BusActions } from "../services/BusActions.ts"
import type { InventoryService } from "../services/InventoryService.ts"
import type { McpTool } from "./McpTool.ts"
import { ForceTool, InjectTool, ReleaseTool } from "./tools/operate/BusTools.ts"
import { OperateValues } from "./tools/operate/OperateValues.ts"
import { RunPluginActionTool } from "./tools/operate/RunPluginActionTool.ts"
import type { PluginRefs } from "./tools/plugins/PluginRefs.ts"

/** what the operate tools act through */
export interface McpOperateSources {
  busActions: Pick<BusActions, "force" | "release" | "inject">
  /** PluginActionService */
  actions: { run(instanceId: string, action: string, input: unknown, by: string): Promise<PluginActionResultDto> }
  now?: () => number
}

/** The operate tools of A3 (ADR 0020): they act on the house, so only tokens with `operate` see them. */
export class McpOperateTools {
  readonly tools: McpTool[]

  constructor(sources: McpOperateSources, plugins: Pick<PluginRefs, "instance" | "package">, inventory: Pick<InventoryService, "find">) {
    const values = new OperateValues(inventory)
    this.tools = [
      new ForceTool(values, sources.busActions, sources.now ?? (() => Date.now())),
      new ReleaseTool(values, sources.busActions),
      new InjectTool(values, sources.busActions),
      new RunPluginActionTool(plugins, sources.actions)
    ]
  }
}
