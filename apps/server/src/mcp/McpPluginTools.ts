import type { BridgeRequest, BridgeResultDto, LoxoneSignalDto, PluginReadmeDto, PluginSignalDto, WireDto } from "@lox-nexus/api"
import type { CatalogNode } from "@lox-nexus/plugin-sdk/wire"
import type { McpRefs } from "./McpRefs.ts"
import type { McpTool } from "./McpTool.ts"
import { BridgeTool } from "./tools/plugins/BridgeTool.ts"
import { CatalogCache } from "./tools/plugins/CatalogCache.ts"
import { DescribePluginTool } from "./tools/plugins/DescribePluginTool.ts"
import { PlanBridgeTool } from "./tools/plugins/PlanBridgeTool.ts"
import { PluginRefs, type PluginRefSources } from "./tools/plugins/PluginRefs.ts"
import { SearchCatalogTool } from "./tools/plugins/SearchCatalogTool.ts"

/** what the plugin tools read and change */
export interface McpPluginSources {
  plugins: PluginRefSources["plugins"] & { catalog(instanceId: string): Promise<CatalogNode[]> | CatalogNode[] }
  pluginSignals: { list(instanceId: string): PluginSignalDto[] }
  loxoneSignals: { list(miniserverId: string): LoxoneSignalDto[] }
  wires: { list(): WireDto[] }
  /** PluginBridgeService */
  bridges: { bridge(instanceId: string, input: BridgeRequest, by: string): Promise<BridgeResultDto[]> }
  /** PluginPackageService */
  readmes: { readme(id: string): PluginReadmeDto | undefined }
  now?: () => number
}

/** The plugin tools of A2 (ADR 0020): learn a plugin, search its catalog, connect its signals to a Miniserver. */
export class McpPluginTools {
  readonly tools: McpTool[]

  constructor(sources: McpPluginSources, miniservers: Pick<McpRefs, "miniserver">) {
    const refs = new PluginRefs(sources)
    const catalogs = new CatalogCache(sources.plugins, sources.now ?? (() => Date.now()))
    this.tools = [
      new DescribePluginTool(refs, sources.plugins, sources.readmes),
      new SearchCatalogTool(refs, catalogs, sources.pluginSignals),
      new PlanBridgeTool(refs, miniservers, sources),
      new BridgeTool(refs, miniservers, sources.pluginSignals, sources.bridges)
    ]
  }
}
