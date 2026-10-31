import type { Logger } from "pino"
import { z } from "zod"
import { JsonRpc, JsonRpcMessageSchema, type JsonRpcId } from "./JsonRpc.ts"
import { JsonRpcError } from "./JsonRpcError.ts"
import { McpInstructions } from "./McpInstructions.ts"
import { McpProtocol } from "./McpProtocol.ts"
import type { McpRateLimit } from "./McpRateLimit.ts"
import type { ResourceRegistry } from "./ResourceRegistry.ts"
import type { ToolCall } from "./ToolCall.ts"
import type { ToolContext } from "./ToolContext.ts"
import type { ToolRegistry } from "./ToolRegistry.ts"

const CallParams = z.object({ name: z.string().min(1), arguments: z.record(z.string(), z.unknown()).optional() })
const ReadParams = z.object({ uri: z.string().min(1) })

/**
 * One JSON-RPC message in, one answer out (or none for a notification or a client's response):
 * the stateless MCP server. Methods: initialize, ping, tools, resources and prompts. Batches are
 * refused (MCP 2025-06-18 dropped them).
 */
export class McpDispatcher {
  constructor(
    private readonly tools: ToolRegistry,
    private readonly resources: ResourceRegistry,
    private readonly call: Pick<ToolCall, "run">,
    private readonly version: string,
    private readonly limit: Pick<McpRateLimit, "acquire">,
    private readonly log: Pick<Logger, "error">
  ) {}

  /** @returns the answer, or undefined when none is due (HTTP 202) */
  async handle(body: unknown, context: ToolContext): Promise<object | undefined> {
    if (Array.isArray(body)) return JsonRpc.error(null, JsonRpc.INVALID_REQUEST, "batches are not supported")
    const parsed = JsonRpcMessageSchema.safeParse(body)
    if (!parsed.success) return McpDispatcher.isResponse(body) ? undefined : JsonRpc.error(McpDispatcher.idOf(body), JsonRpc.INVALID_REQUEST, "not a JSON-RPC 2.0 request")
    const { id, method, params } = parsed.data
    if (id === undefined) return undefined
    try {
      return JsonRpc.result(id, await this.method(method, params ?? {}, context))
    } catch (error) {
      if (error instanceof JsonRpcError) return JsonRpc.error(id, error.code, error.message, error.data)
      this.log.error({ err: error, method }, "MCP request failed")
      return JsonRpc.error(id, JsonRpc.INTERNAL_ERROR, "the request failed unexpectedly; the Nexus log has the details")
    }
  }

  private async method(method: string, params: Record<string, unknown>, context: ToolContext): Promise<unknown> {
    const scopes = context.access.scopes
    switch (method) {
      case "initialize": return this.initialize(params.protocolVersion)
      case "ping": return {}
      case "tools/list": return this.limited(context, () => ({ tools: this.tools.list(scopes) }))
      // takes its call from the token's bucket itself, with the stricter rate for changing tools
      case "tools/call": return this.callTool(params, context)
      case "resources/list": return this.limited(context, () => ({ resources: this.resources.list(scopes) }))
      case "resources/templates/list": return { resourceTemplates: [] }
      case "resources/read": return this.limited(context, () => this.resources.read(McpDispatcher.params(ReadParams, params).uri, context))
      case "prompts/list": return { prompts: [] }
      case "prompts/get": throw new JsonRpcError(JsonRpc.INVALID_PARAMS, "this server has no prompts yet")
      default: throw new JsonRpcError(JsonRpc.METHOD_NOT_FOUND, `unknown method ${method}`)
    }
  }

  // a looping agent reading the inventory counts against the token's calls like a tool call
  private async limited<T>(context: ToolContext, work: () => T | Promise<T>): Promise<T> {
    const release = await this.limit.acquire(context.access.tokenId, false)
    try {
      return await work()
    } finally {
      release()
    }
  }

  private initialize(requested: unknown) {
    return {
      protocolVersion: McpProtocol.negotiate(requested),
      capabilities: McpProtocol.CAPABILITIES,
      serverInfo: McpProtocol.serverInfo(this.version),
      instructions: McpInstructions.TEXT
    }
  }

  private callTool(params: Record<string, unknown>, context: ToolContext) {
    const { name, arguments: args } = McpDispatcher.params(CallParams, params)
    const tool = this.tools.get(name, context.access.scopes)
    if (!tool) throw new JsonRpcError(JsonRpc.INVALID_PARAMS, `unknown tool ${name}, or one this token's scopes don't allow`)
    return this.call.run(tool, args ?? {}, context)
  }

  private static params<T>(schema: z.ZodType<T>, params: Record<string, unknown>): T {
    const parsed = schema.safeParse(params)
    if (!parsed.success) throw new JsonRpcError(JsonRpc.INVALID_PARAMS, z.prettifyError(parsed.error))
    return parsed.data
  }

  // a client answering a request of ours; this server sends none, so it is only acknowledged
  private static isResponse(body: unknown) {
    return typeof body === "object" && body !== null && !("method" in body) && ("result" in body || "error" in body)
  }

  private static idOf(body: unknown): JsonRpcId {
    const id = typeof body === "object" && body !== null ? (body as { id?: unknown }).id : undefined
    return typeof id === "string" || typeof id === "number" ? id : null
  }
}
