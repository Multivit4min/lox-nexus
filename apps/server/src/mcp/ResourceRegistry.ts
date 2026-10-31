import type { AccessScope } from "@lox-nexus/api"
import { JsonRpc } from "./JsonRpc.ts"
import { JsonRpcError } from "./JsonRpcError.ts"
import type { McpResource } from "./McpResource.ts"
import type { ToolContext } from "./ToolContext.ts"

/** The resources, filtered by scope like the tools. Templates arrive with A2. */
export class ResourceRegistry {
  static readonly MAX_TEXT = 64 * 1024

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
    // the same cap as tool results; resources size themselves to stay under it (the inventory does)
    const capped = text.length <= ResourceRegistry.MAX_TEXT ? text : `${text.slice(0, ResourceRegistry.MAX_TEXT)}\n… cut at 64 KB`
    return { contents: [{ uri, mimeType: resource.mimeType, text: capped }] }
  }
}
