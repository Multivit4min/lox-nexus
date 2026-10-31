import type { AccessScope } from "@lox-nexus/api"
import { z } from "zod"
import type { McpTool } from "./McpTool.ts"

/** The tools, as `tools/list` shows them: only those the token's scopes allow, so it never sees what it can't call. */
export class ToolRegistry {
  private readonly tools = new Map<string, McpTool>()

  constructor(tools: readonly McpTool[]) {
    for (const tool of tools) {
      if (this.tools.has(tool.name)) throw new Error(`two MCP tools are named "${tool.name}"`)
      this.tools.set(tool.name, tool)
    }
  }

  /** for tools/list; the input schema as JSON Schema (what the agent may send) */
  list(scopes: readonly AccessScope[]) {
    return [...this.tools.values()].filter(tool => scopes.includes(tool.scope)).map(tool => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: ToolRegistry.schema(tool),
      ...(tool.annotations ? { annotations: { title: tool.title, ...tool.annotations } } : {})
    }))
  }

  /** undefined for an unknown tool and for one the scopes don't allow alike */
  get(name: string, scopes: readonly AccessScope[]) {
    const tool = this.tools.get(name)
    return tool && scopes.includes(tool.scope) ? tool : undefined
  }

  // MCP wants a plain object schema; zod adds $schema, which clients don't need
  private static schema(tool: McpTool) {
    const schema: Record<string, unknown> = { ...z.toJSONSchema(tool.input, { io: "input", unrepresentable: "any" }) }
    delete schema.$schema
    return schema.type === "object" ? schema : { type: "object", properties: {} }
  }
}
