import { SystemClock, type Clock } from "@lox-nexus/plugin-sdk"
import { z, ZodError } from "zod"
import type { Logger } from "pino"
import type { ChangeLock } from "../http/ChangeLock.ts"
import { HttpError } from "../http/HttpError.ts"
import type { Confirmations } from "./Confirmations.ts"
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
 * Runs one tool call with the rules every tool shares: the rate limit, confirmations for
 * destructive tools, the ChangeLock for changing tools, input checking, a deadline, the 64 KB cap
 * and the audit. Refusals (invalid input, a 400 or 409 from a service, a running config import)
 * come back as `isError` results with the reason, so the model can correct itself; only
 * unexpected failures are logged as errors.
 */
export class ToolCall {
  /** a result longer than this is cut, with a note on how to ask for less */
  static readonly MAX_TEXT = 64 * 1024
  /** how long the agent waits by default; a tool may set its own */
  static readonly TIMEOUT_MS = 30_000

  constructor(
    private readonly limit: Pick<McpRateLimit, "acquire">,
    private readonly lock: Pick<ChangeLock, "enter"> | undefined,
    private readonly audit: Pick<McpAudit, "changed">,
    private readonly log: Pick<Logger, "error">,
    private readonly confirmations?: Pick<Confirmations, "create" | "consume">,
    private readonly clock: Pick<Clock, "setTimeout" | "clearTimeout"> = SystemClock.instance
  ) {}

  /** @throws JsonRpcError when the token is over its rate limit */
  async run(tool: McpTool, args: unknown, context: ToolContext): Promise<ToolResult> {
    const release = await this.limit.acquire(context.access.tokenId, tool.changes === true)
    let settled: Promise<unknown> = Promise.resolve()
    try {
      const parsed = tool.input.safeParse(args ?? {})
      if (!parsed.success) return ToolCall.refusal(`invalid arguments: ${z.prettifyError(parsed.error)}`)
      if (tool.confirm) {
        const step = await this.confirmation(tool, parsed.data, context)
        if (step) return step
      }
      const outcome = await this.execute(tool, parsed.data, context)
      settled = outcome.settled
      return outcome.result
    } finally {
      // a call past its deadline keeps its slot until it really ends
      void settled.finally(release)
    }
  }

  // the first call of a destructive tool: what it would take along, and the id for the second
  private async confirmation(tool: McpTool, input: unknown, context: ToolContext): Promise<ToolResult | undefined> {
    const { confirmation, ...args } = (input ?? {}) as { confirmation?: string }
    if (!this.confirmations) return ToolCall.refusal("this tool needs confirmations, which this server doesn't offer")
    if (confirmation !== undefined) {
      return this.confirmations.consume(confirmation, context.access.tokenId, tool.name, args) ? undefined
        : ToolCall.refusal("unknown or expired confirmation, or other arguments than the first call: call again without `confirmation`")
    }
    const summary = await tool.confirm!(input, context)
    const id = this.confirmations.create(context.access.tokenId, tool.name, args)
    return { content: [{ type: "text", text: JSON.stringify({ needsConfirmation: true, summary, confirmation: id, expiresInS: 300, then: "call again with the same arguments and this confirmation to do it" }) }] }
  }

  private async execute(tool: McpTool, input: unknown, context: ToolContext): Promise<{ result: ToolResult; settled: Promise<unknown> }> {
    let unlock = () => {}
    try {
      if (tool.changes) unlock = this.lock?.enter() ?? unlock
    } catch (error) {
      return { result: this.failed(tool, input, context, error), settled: Promise.resolve() }
    }
    const running = Promise.resolve().then(() => tool.run(input, context))
    // the lock is held until the work really ends, also past the deadline: an import mustn't run under it
    const settled = running.then(() => {}, () => {}).finally(unlock)
    const ms = tool.timeoutMs ?? ToolCall.TIMEOUT_MS
    const outcome = await this.within(running, ms)
    if (outcome === "late") {
      if (tool.changes) this.audit.changed(context, tool.name, input, "failed", `still running after ${ms / 1000} s`)
      return { result: ToolCall.refusal(`no answer within ${ms / 1000} s; it goes on in the background, so check its result before trying again`), settled }
    }
    if ("error" in outcome) return { result: this.failed(tool, input, context, outcome.error), settled }
    if (tool.changes) this.audit.changed(context, tool.name, input, "ok")
    return { result: { content: [{ type: "text", text: ToolCall.text(outcome.value) }] }, settled }
  }

  private failed(tool: McpTool, input: unknown, context: ToolContext, error: unknown): ToolResult {
    const refusal = ToolCall.reason(error)
    if (tool.changes) this.audit.changed(context, tool.name, input, refusal ? "refused" : "failed", refusal)
    if (refusal) return ToolCall.refusal(refusal)
    this.log.error({ err: error, tool: tool.name }, "MCP tool failed")
    return ToolCall.refusal("the tool failed unexpectedly; the Nexus log has the details")
  }

  private within(work: Promise<unknown>, ms: number): Promise<"late" | { value: unknown } | { error: unknown }> {
    return new Promise(resolve => {
      const timer = this.clock.setTimeout(() => resolve("late"), ms)
      work.then(value => resolve({ value }), (error: unknown) => resolve({ error })).finally(() => this.clock.clearTimeout(timer))
    })
  }

  // what the model may read: a service's own refusal, or zod's issues; never a stack
  private static reason(error: unknown) {
    if (error instanceof HttpError && (error.status < 500 || error.status === 503)) return error.message
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
