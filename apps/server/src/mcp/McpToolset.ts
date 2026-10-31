import type { McpLoxoneSources } from "./McpLoxoneTools.ts"
import { McpLoxoneTools } from "./McpLoxoneTools.ts"
import { McpPluginTools, type McpPluginSources } from "./McpPluginTools.ts"
import { McpReadTools, type McpReadSources } from "./McpReadTools.ts"
import type { McpResource } from "./McpResource.ts"
import type { McpTool } from "./McpTool.ts"
import { McpWireTools } from "./McpWireTools.ts"
import type { WireWrites } from "./tools/wires/WireWrites.ts"

/** everything the tools read and change; NexusApp passes its services */
export type McpToolSources = McpReadSources & Omit<McpLoxoneSources, "inventory"> & { wires: WireWrites } & McpPluginSources

/** All tools and resources the MCP interface offers, built from the app's services. */
export class McpToolset {
  readonly tools: McpTool[]
  readonly resources: McpResource[]

  constructor(sources: McpToolSources) {
    const read = new McpReadTools(sources)
    const loxone = new McpLoxoneTools({ ...sources, inventory: read.inventory })
    const wires = new McpWireTools(sources.wires, read.inventory)
    const plugins = new McpPluginTools(sources, loxone.refs)
    this.tools = [...read.tools, ...loxone.tools, ...wires.tools, ...plugins.tools]
    this.resources = read.resources
  }
}
