import type { AccessScope } from "@lox-nexus/api"
import { JsonRpc } from "./JsonRpc.ts"
import { JsonRpcError } from "./JsonRpcError.ts"
import type { McpResource } from "./McpResource.ts"
import type { ToolContext } from "./ToolContext.ts"

/** The resources, filtered by scope like the tools. Templates arrive with A2. */
export class ResourceRegistry {
  constructor(private readonly resources: readonly McpResource[]) {}

  list(scopes: readonly AccessScope[]) {
    return this.resources.filter(resource => scopes.includes(resource.scope))
      .map(({ uri, name, title, description, mimeType }) => ({ uri, name, title, description, mimeType }))
  }

  /** @throws JsonRpcError for an unknown resource or one the scopes don't allow */
  async read(uri: string, context: ToolContext) {
    const resource = this.resources.find(candidate => candidate.uri === uri && context.access.scopes.includes(candidate.scope))
    if (!resource) throw new JsonRpcError(JsonRpc.RESOURCE_NOT_FOUND, `no resource ${uri}`, { uri })
    const content = await resource.read(context)
    const text = typeof content === "string" ? content : JSON.stringify(content)
    return { contents: [{ uri, mimeType: resource.mimeType, text }] }
  }
}
