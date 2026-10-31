import type { McpLoxoneSources } from "./McpLoxoneTools.ts"
import { McpLoxoneTools } from "./McpLoxoneTools.ts"
import { McpOperateTools, type McpOperateSources } from "./McpOperateTools.ts"
import { McpPluginTools, type McpPluginSources } from "./McpPluginTools.ts"
import { McpReadTools, type McpReadSources } from "./McpReadTools.ts"
import { McpSetupTools, type McpSetupSources } from "./McpSetupTools.ts"
import { McpPrompts } from "./McpPrompts.ts"
import type { McpPrompt } from "./McpPrompt.ts"
import type { McpResource } from "./McpResource.ts"
import type { McpResourceTemplate } from "./McpResourceTemplate.ts"
import type { McpTool } from "./McpTool.ts"
import { McpWireTools } from "./McpWireTools.ts"
import type { WireWrites } from "./tools/wires/WireWrites.ts"

/** everything the tools read and change; NexusApp passes its services */
export type McpToolSources = McpReadSources & Omit<McpLoxoneSources, "inventory"> & { wires: WireWrites } & McpPluginSources & McpSetupSources & McpOperateSources

/** All tools and resources the MCP interface offers, built from the app's services. */
export class McpToolset {
  readonly tools: McpTool[]
  readonly resources: McpResource[]
  readonly templates: McpResourceTemplate[]
  readonly prompts: readonly McpPrompt[] = McpPrompts.ALL

  constructor(sources: McpToolSources) {
    const read = new McpReadTools(sources)
    const loxone = new McpLoxoneTools({ ...sources, inventory: read.inventory })
    const wires = new McpWireTools(sources.wires, read.inventory)
    const plugins = new McpPluginTools(sources, loxone.refs)
    const setup = new McpSetupTools(sources, { miniservers: loxone.refs, plugins: plugins.refs }, read.inventory)
    const operate = new McpOperateTools(sources, plugins.refs, read.inventory)
    this.tools = [...read.tools, ...loxone.tools, ...wires.tools, ...plugins.tools, ...setup.tools, ...operate.tools]
    this.resources = read.resources
    this.templates = [...loxone.templates, ...plugins.templates]
  }
}
