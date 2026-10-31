import { z, ZodError } from "zod"
import type { Logger } from "pino"
import type { ChangeLock } from "../http/ChangeLock.ts"
import { HttpError } from "../http/HttpError.ts"
import type { McpAudit } from "./McpAudit.ts"
import type { McpRateLimit } from "./McpRateLimit.ts"
import type { McpTool } from "./McpTool.ts"
import type { ToolContext } from "./ToolContext.ts"

/** what tools/call answers: text content, `isError` for refusals the model can act on */
export interface ToolResult {
  content: { type: "text"; text: string }[]
  isError?: true
}

/**
 * Runs one tool call with the rules every tool shares: the rate limit, the ChangeLock for
 * changing tools, input checking, the 64 KB cap, and the audit. Refusals (invalid input, a 400
 * or 409 from a service, a running config import) come back as `isError` results with the
 * reason, so the model can correct itself; only unexpected failures are logged as errors.
 */
export class ToolCall {
  /** a result longer than this is cut, with a note on how to ask for less */
  static readonly MAX_TEXT = 64 * 1024

  constructor(
    private readonly limit: Pick<McpRateLimit, "acquire">,
    private readonly lock: Pick<ChangeLock, "enter"> | undefined,
    private readonly audit: Pick<McpAudit, "changed">,
    private readonly log: Pick<Logger, "error">
  ) {}

  /** @throws JsonRpcError when the token is over its rate limit */
  async run(tool: McpTool, args: unknown, context: ToolContext): Promise<ToolResult> {
    const release = await this.limit.acquire(context.access.tokenId, tool.changes === true)
    try {
      const parsed = tool.input.safeParse(args ?? {})
      if (!parsed.success) return ToolCall.refusal(`invalid arguments: ${z.prettifyError(parsed.error)}`)
      return await this.execute(tool, parsed.data, context)
    } finally {
      release()
    }
  }

  private async execute(tool: McpTool, input: unknown, context: ToolContext): Promise<ToolResult> {
    let unlock = () => {}
    try {
      if (tool.changes) unlock = this.lock?.enter() ?? unlock
      const result = await tool.run(input, context)
      if (tool.changes) this.audit.changed(context, tool.name, input, "ok")
      return { content: [{ type: "text", text: ToolCall.text(result) }] }
    } catch (error) {
      const refusal = ToolCall.reason(error)
      if (tool.changes) this.audit.changed(context, tool.name, input, refusal ? "refused" : "failed", refusal)
      if (refusal) return ToolCall.refusal(refusal)
      this.log.error({ err: error, tool: tool.name }, "MCP tool failed")
      return ToolCall.refusal("the tool failed unexpectedly; the Nexus log has the details")
    } finally {
      unlock()
    }
  }

  // what the model may read: a service's own refusal, or zod's issues; never a stack
  private static reason(error: unknown) {
    if (error instanceof HttpError && error.status < 500) return error.message
    if (error instanceof HttpError && error.status === 503) return error.message
    if (error instanceof ZodError) return z.prettifyError(error)
    return undefined
  }

  private static refusal(text: string): ToolResult {
    return { content: [{ type: "text", text }], isError: true }
  }

  private static text(result: unknown) {
    const text = typeof result === "string" ? result : JSON.stringify(result ?? null)
    if (text.length <= ToolCall.MAX_TEXT) return text
    return `${text.slice(0, ToolCall.MAX_TEXT)}\n… cut at 64 KB: ask for less (a limit, a cursor or a filter)`
  }
}
