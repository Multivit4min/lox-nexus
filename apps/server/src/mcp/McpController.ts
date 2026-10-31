import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import type { Controller } from "../http/Controller.ts"
import { JsonRpc } from "./JsonRpc.ts"
import type { McpDispatcher } from "./McpDispatcher.ts"
import { McpProtocol } from "./McpProtocol.ts"

/**
 * POST /mcp: the MCP endpoint (Streamable HTTP, stateless, JSON answers). Only an access token
 * reaches it (`tokenAuth`: the session cookie is ignored); it is lock-free, because reads must go
 * on during a config import, and changing tools take the ChangeLock themselves.
 *
 * - 200 with the JSON-RPC answer; 202 for a notification or a client's response.
 * - 400 with a JSON-RPC error for invalid JSON or an MCP-Protocol-Version this server doesn't speak.
 * - 401 without a valid token, 403 cross-origin, 429 too many wrong tokens (AuthGuard).
 * - GET and DELETE: 405 (no server stream, no sessions).
 */
export class McpController implements Controller {
  constructor(private readonly dispatcher: Pick<McpDispatcher, "handle">) {}

  register(app: FastifyInstance) {
    app.post("/mcp", { config: { tokenAuth: true, lockFree: true }, errorHandler: McpController.failed }, (request, reply) => this.post(request, reply))
    for (const method of ["GET", "DELETE"] as const) {
      app.route({ method, url: "/mcp", config: { tokenAuth: true }, handler: (_request, reply) =>
        reply.code(405).header("allow", "POST").send({ error: "this MCP server is stateless: POST only, no stream and no sessions" }) })
    }
  }

  private async post(request: FastifyRequest, reply: FastifyReply) {
    const version = request.headers["mcp-protocol-version"]
    if (typeof version === "string" && !McpProtocol.supports(version)) {
      return reply.code(400).send(JsonRpc.error(null, JsonRpc.INVALID_REQUEST, `unsupported MCP protocol version ${version}; this server speaks ${McpProtocol.SUPPORTED.join(", ")}`))
    }
    const user = request.user!
    const access = request.access!
    // a client that gives up aborts what its call started
    const abort = new AbortController()
    reply.raw.once("close", () => {
      if (!reply.raw.writableEnded) abort.abort()
    })
    const answer = await this.dispatcher.handle(request.body, { user, access, by: `${user.username} via MCP (${access.name})`, signal: abort.signal })
    if (!answer) return reply.code(202).send()
    return reply.code(200).type("application/json").send(answer)
  }

  // JSON-RPC errors instead of the API's own: invalid JSON is a parse error, a wrong content type or
  // a body over the limit an invalid request, anything unexpected an internal error
  private static failed(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
    if (error.code?.startsWith("FST_ERR_CTP")) {
      const status = error.statusCode ?? 400
      return reply.code(status).send(JsonRpc.error(null, status === 400 ? JsonRpc.PARSE_ERROR : JsonRpc.INVALID_REQUEST, error.message))
    }
    request.log.error({ err: error }, "MCP request failed")
    return reply.code(500).send(JsonRpc.error(null, JsonRpc.INTERNAL_ERROR, "the request failed unexpectedly; the Nexus log has the details"))
  }
}
