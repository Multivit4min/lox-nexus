import type { BridgeRequest, BridgeResultDto, DiscoveredPacketDto, LoxoneSignalDto, PluginLogLineDto, PluginReadmeDto, PluginSignalDto, WireDto } from "@lox-nexus/api"
import type { CatalogNode, Panel } from "@lox-nexus/plugin-sdk/wire"
import type { McpRefs } from "./McpRefs.ts"
import type { McpResourceTemplate } from "./McpResourceTemplate.ts"
import type { McpTool } from "./McpTool.ts"
import { BridgeTool } from "./tools/plugins/BridgeTool.ts"
import { CatalogCache } from "./tools/plugins/CatalogCache.ts"
import { DescribePluginTool } from "./tools/plugins/DescribePluginTool.ts"
import { GetLogsTool } from "./tools/plugins/GetLogsTool.ts"
import { GetPanelTool } from "./tools/plugins/GetPanelTool.ts"
import { PlanBridgeTool } from "./tools/plugins/PlanBridgeTool.ts"
import { PluginRefs, type PluginRefSources } from "./tools/plugins/PluginRefs.ts"
import { SearchCatalogTool } from "./tools/plugins/SearchCatalogTool.ts"

/** what the plugin tools read and change */
export interface McpPluginSources {
  plugins: PluginRefSources["plugins"] & {
    catalog(instanceId: string): Promise<CatalogNode[]> | CatalogNode[]
    panel(instanceId: string): Promise<Panel | undefined> | Panel | undefined
  }
  /** PluginLogs */
  logs: { recent(instanceId: string): PluginLogLineDto[] }
  pluginSignals: { list(instanceId: string): PluginSignalDto[] }
  loxoneSignals: { list(miniserverId: string): LoxoneSignalDto[]; discovered(miniserverId: string): DiscoveredPacketDto[] }
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
  readonly templates: McpResourceTemplate[]

  constructor(sources: McpPluginSources, miniservers: Pick<McpRefs, "miniserver">) {
    const refs = new PluginRefs(sources)
    const catalogs = new CatalogCache(sources.plugins, sources.now ?? (() => Date.now()))
    const describe = new DescribePluginTool(refs, sources.plugins, sources.readmes)
    this.tools = [
      describe,
      new SearchCatalogTool(refs, catalogs, sources.pluginSignals),
      new PlanBridgeTool(refs, miniservers, sources),
      new BridgeTool(refs, miniservers, sources.pluginSignals, sources.bridges),
      new GetPanelTool(refs, sources.plugins),
      new GetLogsTool(refs, sources.logs)
    ]
    this.templates = [{
      uriTemplate: "nexus://plugins/{plugin}/readme", name: "plugin-readme", title: "A plugin's README", mimeType: "text/markdown", scope: "read",
      description: "How to set a plugin up and what it offers, as its author wrote it (cut at 32 KB).",
      read: params => describe.run({ plugin: params.plugin ?? "", readme: true }).readme ?? "This plugin has no README."
    }]
  }
}
