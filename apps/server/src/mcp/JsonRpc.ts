import { z } from "zod"

/** a request (with `id`) or a notification (without) */
export const JsonRpcMessageSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number().int()]).optional(),
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional()
})
export type JsonRpcMessage = z.infer<typeof JsonRpcMessageSchema>
export type JsonRpcId = string | number | null

/** JSON-RPC 2.0 answers and the error codes MCP uses. */
export class JsonRpc {
  static readonly PARSE_ERROR = -32700
  static readonly INVALID_REQUEST = -32600
  static readonly METHOD_NOT_FOUND = -32601
  static readonly INVALID_PARAMS = -32602
  static readonly INTERNAL_ERROR = -32603
  /** MCP: an unknown resource */
  static readonly RESOURCE_NOT_FOUND = -32002
  /** implementation-defined: too many calls for the token; `data.retryAfterS` says when to try */
  static readonly RATE_LIMITED = -32000

  static result(id: JsonRpcId, result: unknown) {
    return { jsonrpc: "2.0" as const, id, result }
  }

  static error(id: JsonRpcId, code: number, message: string, data?: unknown) {
    return { jsonrpc: "2.0" as const, id, error: { code, message, ...(data === undefined ? {} : { data }) } }
  }
}
