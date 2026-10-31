import type { AccessScope } from "@lox-nexus/api"
import { HttpError } from "../http/HttpError.ts"
import { JsonRpc } from "./JsonRpc.ts"
import { JsonRpcError } from "./JsonRpcError.ts"
import type { McpResource } from "./McpResource.ts"
import { UriTemplate, type McpResourceTemplate } from "./McpResourceTemplate.ts"
import { Refusals } from "./Refusals.ts"
import type { ToolContext } from "./ToolContext.ts"

/** The resources and resource templates, filtered by scope like the tools. */
export class ResourceRegistry {
  static readonly MAX_TEXT = 64 * 1024

  constructor(private readonly resources: readonly McpResource[], private readonly templates: readonly McpResourceTemplate[] = []) {}

  list(scopes: readonly AccessScope[]) {
    return this.resources.filter(resource => scopes.includes(resource.scope))
      .map(({ uri, name, title, description, mimeType }) => ({ uri, name, title, description, mimeType }))
  }

  listTemplates(scopes: readonly AccessScope[]) {
    return this.templates.filter(template => scopes.includes(template.scope))
      .map(({ uriTemplate, name, title, description, mimeType }) => ({ uriTemplate, name, title, description, mimeType }))
  }

  /** @throws JsonRpcError for an unknown resource or one the scopes don't allow */
  async read(uri: string, context: ToolContext) {
    const found = this.find(uri, context)
    if (!found) throw new JsonRpcError(JsonRpc.RESOURCE_NOT_FOUND, `no resource ${uri}`, { uri })
    const content = await ResourceRegistry.content(uri, found.read)
    const text = typeof content === "string" ? content : JSON.stringify(content)
    // the same cap as tool results; resources size themselves to stay under it (the inventory does)
    const capped = text.length <= ResourceRegistry.MAX_TEXT ? text : `${text.slice(0, ResourceRegistry.MAX_TEXT)}\n… cut at 64 KB`
    return { contents: [{ uri, mimeType: found.mimeType, text: capped }] }
  }

  // a template's variable that names nothing is an unknown resource; another refusal is the client's mistake
  private static async content(uri: string, read: () => unknown) {
    try {
      return await read()
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) throw new JsonRpcError(JsonRpc.RESOURCE_NOT_FOUND, error.message, { uri })
      const refusal = Refusals.reason(error)
      if (refusal) throw new JsonRpcError(JsonRpc.INVALID_PARAMS, refusal)
      throw error
    }
  }

  private find(uri: string, context: ToolContext): { mimeType: string; read: () => unknown } | undefined {
    const scopes = context.access.scopes
    const resource = this.resources.find(candidate => candidate.uri === uri && scopes.includes(candidate.scope))
    if (resource) return { mimeType: resource.mimeType, read: () => resource.read(context) }
    for (const template of this.templates) {
      const params = scopes.includes(template.scope) ? UriTemplate.match(template.uriTemplate, uri) : undefined
      if (params) return { mimeType: template.mimeType, read: () => template.read(params, context) }
    }
    return undefined
  }
}
